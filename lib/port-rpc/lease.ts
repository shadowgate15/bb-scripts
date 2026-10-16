import { getNs } from '@ns'
import type { Channel } from './channel'

interface LeaseMarker {
  owner: string
  expires: number
}

export interface Lease {
  replyPort: number
  /** Frees the slot. Safe to call twice, and a no-op if the lease expired. */
  release: () => void
}

function isMarker(value: unknown): value is LeaseMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LeaseMarker).owner === 'string' &&
    typeof (value as LeaseMarker).expires === 'number'
  )
}

/**
 * Tries each slot once and returns a lease on the first free one.
 *
 * A slot is free when its lock port is empty or holds an expired marker.
 * Claiming is a check followed by a write with no `await` in between. Netscript
 * is single-threaded, so no other script can interleave there, which makes the
 * claim atomic (proved by `servers/home/tmp/claim-atomicity.ts`).
 *
 * Markers carry an expiry so a script killed mid-call can't leak its slot
 * forever.
 */
export function tryClaim(
  channel: Channel,
  owner: string,
  expires: number,
): Lease | null {
  const ns = getNs()
  const now = Date.now()
  const offset = Math.floor(Math.random() * channel.poolSize)

  for (let n = 0; n < channel.poolSize; n++) {
    const slot = (offset + n) % channel.poolSize
    const lock = ns.getPortHandle(channel.lockBase + slot)

    if (!lock.empty()) {
      const marker = lock.peek()

      if (isMarker(marker) && marker.expires > now) {
        continue
      }

      lock.clear()
    }

    lock.write({ owner, expires } satisfies LeaseMarker)

    const replyPort = ns.getPortHandle(channel.replyBase + slot)

    // Drop anything a previous holder's late response left behind.
    replyPort.clear()

    return {
      replyPort: channel.replyBase + slot,
      release: () => {
        const current = lock.peek()

        // Only the current owner may clear: after expiry the slot may belong to
        // someone else.
        if (isMarker(current) && current.owner === owner) {
          lock.clear()
          replyPort.clear()
        }
      },
    }
  }

  return null
}

/** Waits for a free slot, throwing once `deadline` (epoch ms) passes. */
export async function claim(
  channel: Channel,
  owner: string,
  deadline: number,
  leaseGraceMs: number,
): Promise<Lease> {
  const ns = getNs()

  while (true) {
    const lease = tryClaim(channel, owner, deadline + leaseGraceMs)

    if (lease !== null) {
      return lease
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `no free reply port on channel ${channel.requestPort} (pool of ${channel.poolSize} exhausted)`,
      )
    }

    await ns.asleep(25)
  }
}
