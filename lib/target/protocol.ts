import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

export interface TargetInfo {
  host: string
  maxMoney: number
  minSecurity: number
  /** Ranking value: max money per ms of weaken time. */
  score: number
}

/**
 * Shared by the target client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface TargetRpc extends RpcSchema {
  /** Hackable servers, best first. */
  rank: { params: { limit?: number } | undefined; result: TargetInfo[] }
  /** The top-ranked server, or null if none is hackable yet. */
  best: { params: undefined; result: string | null }
}

export const targetChannel = defineChannel(PORTS.TARGET)
