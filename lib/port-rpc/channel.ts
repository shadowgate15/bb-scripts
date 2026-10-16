import type { PORTS } from '../constants/ports'

/** Ports below this are left alone for hand-picked uses. */
const CHANNEL_BASE = 1_000_000

/** Port numbers reserved per channel: 1 request port + lock and reply pools. */
const CHANNEL_STRIDE = 1_000

/**
 * Port layout for one request/response relationship.
 *
 * - `requestPort`: the server's inbox. Many clients write, one server reads.
 * - `lockBase + i`: lease for pool slot `i` (see `lease.ts`).
 * - `replyBase + i`: reply port for pool slot `i`. Only the client holding the
 *   slot's lease reads from it, so there is no head-of-line blocking.
 */
export interface Channel {
  requestPort: number
  lockBase: number
  replyBase: number
  /** Max concurrent in-flight calls. Extra callers wait for a free slot. */
  poolSize: number
}

/**
 * Builds a channel from a service id. Distinct ids never overlap, so a unique
 * `PORTS` member is all a service needs.
 */
export function defineChannel(id: PORTS, poolSize = 16): Channel {
  if (poolSize < 1 || poolSize * 2 + 1 > CHANNEL_STRIDE) {
    throw new Error(
      `poolSize must be between 1 and ${Math.floor((CHANNEL_STRIDE - 1) / 2)}`,
    )
  }

  const requestPort = CHANNEL_BASE + id * CHANNEL_STRIDE

  return {
    requestPort,
    lockBase: requestPort + 1,
    replyBase: requestPort + 1 + poolSize,
    poolSize,
  }
}
