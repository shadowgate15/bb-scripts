import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

export interface Placement {
  host: string
  threads: number
}

export interface ReserveParams {
  ramPerThread: number
  threads: number
  /** How long the reservation holds before it lapses on its own. */
  ttlMs?: number
}

export interface ReserveAllParams {
  /**
   * Each job may be split across hosts, but must fit in full. A job with a
   * `host` is placed on that host only, and before the unpinned ones.
   */
  jobs: { ramPerThread: number; threads: number; host?: string }[]
  ttlMs?: number
}

export interface HostRam {
  host: string
  free: number
  reserved: number
}

/**
 * Shared by the ram-pool client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface RamPoolRpc extends RpcSchema {
  /**
   * Holds RAM for up to `threads` threads, placing as many as fit. Release it
   * once the scripts are exec'd (their RAM then shows as used), or let it lapse.
   */
  reserve: {
    params: ReserveParams
    result: { id: string; placements: Placement[] }
  }
  /**
   * All-or-nothing `reserve` for several jobs at once: returns one placement
   * list per job, or null (holding nothing) if they don't all fit.
   */
  reserveAll: {
    params: ReserveAllParams
    result: { id: string; placements: Placement[][] } | null
  }
  release: { params: { id: string }; result: boolean }
  /** Free (net of reservations) and reserved RAM per rooted host. */
  status: { params: undefined; result: HostRam[] }
}

export const ramPoolChannel = defineChannel(PORTS.RAM_POOL)
