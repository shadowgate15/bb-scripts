import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import type { HostRam, Placement, RamPoolRpc } from '@/lib/ram-pool/protocol'
import { ramPoolChannel } from '@/lib/ram-pool/protocol'
import { rootAll } from '@/lib/rooter/root-all'

/** RAM kept free on home for the services themselves. */
const HOME_RESERVED_RAM = 32
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

  await serve<RamPoolRpc>(
    ramPoolChannel,
    {
      reserve: async ({ ramPerThread, threads, ttlMs = DEFAULT_TTL_MS }) => {
        const hosts = await rootAll()

        // No await below: reading usage and recording the reservation is atomic.
        const placements: Placement[] = []
        let remaining = threads

        for (const host of hosts) {
          if (remaining <= 0) break

          const fit = Math.min(
            remaining,
            Math.floor(freeOn(host, reservedOn(host)) / ramPerThread),
          )

          if (fit < 1) continue

          placements.push({ host, threads: fit })
          remaining -= fit
        }

        const id = crypto.randomUUID()

        reservations.set(id, {
          placements: placements.map((p) => ({
            host: p.host,
            ram: p.threads * ramPerThread,
          })),
          expires: Date.now() + ttlMs,
        })

        return { id, placements }
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
