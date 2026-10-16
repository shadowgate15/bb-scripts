import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import type { HostRam, Placement, RamPoolRpc } from '@/lib/ram-pool/protocol'
import { ramPoolChannel } from '@/lib/ram-pool/protocol'
import { rootAll } from '@/lib/rooter/root-all'

const DEFAULT_TTL_MS = 10_000

interface Reservation {
  placements: { host: string; ram: number }[]
  expires: number
}

/** Owns "where is there free RAM": hands out reservations over rooted servers. */
export const main = entry(async (ns) => {
  const reservations = new Map<string, Reservation>()

  const reservedOn = (host: string) => {
    const now = Date.now()
    let total = 0

    for (const [id, r] of reservations) {
      if (r.expires <= now) {
        reservations.delete(id)
        continue
      }

      for (const p of r.placements) {
        if (p.host === host) total += p.ram
      }
    }

    return total
  }

  const freeOn = (host: string, reserved: number) =>
    ns.getServerMaxRam(host) -
    ns.getServerUsedRam(host) -
    reserved -
    (host === 'home' ? HOME_RESERVED_RAM : 0)

  /** Fits `threads` onto hosts, counting RAM already `held` by this request. */
  const place = (
    hosts: string[],
    ramPerThread: number,
    threads: number,
    held: Map<string, number>,
  ): Placement[] => {
    const placements: Placement[] = []
    let remaining = threads

    for (const host of hosts) {
      if (remaining <= 0) break

      const fit = Math.min(
        remaining,
        Math.floor(
          freeOn(host, reservedOn(host) + (held.get(host) ?? 0)) / ramPerThread,
        ),
      )

      if (fit < 1) continue

      placements.push({ host, threads: fit })
      held.set(host, (held.get(host) ?? 0) + fit * ramPerThread)
      remaining -= fit
    }

    return placements
  }

  const hold = (held: Map<string, number>, ttlMs: number) => {
    const id = crypto.randomUUID()

    reservations.set(id, {
      placements: [...held].map(([host, ram]) => ({ host, ram })),
      expires: Date.now() + ttlMs,
    })

    return id
  }

  const placed = (placements: Placement[]) =>
    placements.reduce((sum, p) => sum + p.threads, 0)

  await serve<RamPoolRpc>(
    ramPoolChannel,
    {
      // No await after `rootAll`: reading usage and recording the hold is atomic.
      reserve: async ({ ramPerThread, threads, ttlMs = DEFAULT_TTL_MS }) => {
        const hosts = await rootAll()
        const held = new Map<string, number>()
        const placements = place(hosts, ramPerThread, threads, held)

        return { id: hold(held, ttlMs), placements }
      },

      reserveAll: async ({ jobs, ttlMs = DEFAULT_TTL_MS }) => {
        const hosts = await rootAll()
        const held = new Map<string, number>()
        const placements = jobs.map((job) =>
          place(hosts, job.ramPerThread, job.threads, held),
        )

        if (jobs.some((job, i) => placed(placements[i]) < job.threads)) {
          return null
        }

        return { id: hold(held, ttlMs), placements }
      },

      release: ({ id }) => reservations.delete(id),

      status: async () =>
        (await rootAll()).map((host): HostRam => {
          const reserved = reservedOn(host)

          return { host, free: freeOn(host, reserved), reserved }
        }),
    },
    { onError: (e) => ns.print(`ram-pool: ${e}`) },
  )
})
