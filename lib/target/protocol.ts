import type { BatchSizes } from '../batch'
import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'
import type { PrepPlan } from '../prep'

export interface TargetInfo {
  host: string
  maxMoney: number
  minSecurity: number
  /** Estimated time to get it to min security and max money with our RAM. */
  prepMs: number
  /** Steady-state batching income with our RAM, per second. */
  incomePerSec: number
  /** Share of max money each batch steals at the best income for our RAM. */
  fraction: number
  /** Thread counts of one batch at that fraction, so callers needn't size it. */
  sizes: BatchSizes
  /** Cores grow and weaken are sized for; above 1 they must run on home. */
  homeCores: number
  /** Batches that fit in flight at that fraction. */
  inFlight: number
  /** Raw pool RAM that batch plan claims, and the part of it that is home's. */
  ramUse: number
  homeUse: number
  /** Ranking value: income per second discounted by the prep it needs first. */
  score: number
}

/** A candidate that did not get a lane, and why. */
export interface SkippedTarget {
  host: string
  score: number
  reason: string
}

/** Why a ranking came back the way it did, for logs. */
export interface TargetReport {
  /** Servers we have root on. */
  rooted: number
  /** RAM available to run scripts across them, in GB. */
  poolRam: number
  rejected: { host: string; reason: string }[]
}

/**
 * Shared by the target client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface TargetRpc extends RpcSchema {
  /** Hackable servers, best first. */
  rank: { params: { limit?: number } | undefined; result: TargetInfo[] }
  /**
   * Up to `limit` servers to hack at once, best first. Each is sized for the
   * RAM left after the ones before it, so the plans fit the pool together.
   * Servers in `keep` get SWITCH_RATIO's benefit of the doubt, so the set only
   * changes for a clearly better one.
   */
  lanes: {
    params: { limit: number; keep: string[] }
    result: { lanes: TargetInfo[]; skipped: SkippedTarget[] }
  }
  /** Why servers were left out of `rank`. */
  explain: { params: undefined; result: TargetReport }
  /**
   * What it takes to get a server to min security and max money, or null once
   * it is within `securitySlack` and `moneyFloor`. Computed fresh each call.
   */
  prep: {
    params: { host: string; securitySlack: number; moneyFloor: number }
    result: PrepPlan | null
  }
  /** The top-ranked server, or null if none is hackable yet. */
  best: { params: undefined; result: string | null }
}

export const targetChannel = defineChannel(PORTS.TARGET)
