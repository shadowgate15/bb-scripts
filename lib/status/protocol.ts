import type { BatchSizes } from '../batch'
import type { Purchase } from '../purchaser/plan'

/**
 * Port the batcher keeps its latest snapshot on (clear + write). Readers
 * `peek` it; no one consumes it. Below port-rpc's range, so it can't collide.
 */
export const BATCHER_STATUS_PORT = 100

/**
 * Port the sharer keeps its latest snapshot on, read the same way as the
 * batcher's.
 */
export const SHARER_STATUS_PORT = 101

/** Port the purchaser keeps its latest snapshot on, read like the others. */
export const PURCHASER_STATUS_PORT = 102

export type BatcherPhase =
  /** No target worth hacking yet. */
  | 'searching'
  /** Getting the target to min security and max money. */
  | 'prepping'
  /** Launching batches. */
  | 'batching'
  /** A better target exists: letting in-flight batches land before switching. */
  | 'retargeting'
  /** Pool is full: waiting for batches to land and free RAM. */
  | 'waiting'

/** One target the batcher is working on. */
export interface LaneStatus {
  target: string
  phase: Exclude<BatcherPhase, 'searching'>
  /** Share of max money each batch steals. */
  fraction: number
  sizes: BatchSizes | null
  /** Cores grow and weaken are pinned to home for, or 1 if they run anywhere. */
  homeCores: number | null
  /** Income the target service expects from this target, per second. */
  estIncomePerSec: number
  batchesLaunched: number
  inFlight: number
  /** Epoch ms the soonest and the latest in-flight batch land; null if none. */
  nextLandingAt: number | null
  lastLandingAt: number | null
  /** Threads in the prep step now running, while prepping. */
  prepThreads: { weaken: number; grow: number } | null
  /** Epoch ms the current prep step finishes, while prepping. */
  prepReadyAt: number | null
  message: string
}

/** What the batcher is doing right now. Shared with whatever displays it. */
export interface BatcherStatus {
  updatedAt: number
  /** The busiest lane's phase, or 'searching' when there are none. */
  phase: BatcherPhase
  /** Targets hacked at once, best first. */
  lanes: LaneStatus[]
  /**
   * Raw pool RAM the lanes' batch plans claim, headroom included. Whatever the
   * pool has beyond this is excess, free for sharing.
   */
  plannedRam: number
  /** Hacking money actually earned, per second, over the last half minute. */
  hackingIncomePerSec: number
  /** Totals across lanes. */
  estIncomePerSec: number
  batchesLaunched: number
  inFlight: number
  message: string
}

export function isBatcherStatus(value: unknown): value is BatcherStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BatcherStatus).updatedAt === 'number' &&
    typeof (value as BatcherStatus).phase === 'string' &&
    Array.isArray((value as BatcherStatus).lanes)
  )
}

/** What the purchaser has bought, or is saving for. */
export interface PurchaserStatus {
  updatedAt: number
  /** True once there is nothing left to buy; the purchaser has exited. */
  done: boolean
  /** What it is saving for, ignoring the budget; null if nothing to buy. */
  next: Purchase | null
  /** RAM of each cloud server we own, in GB. */
  cloudRams: number[]
  cloudLimit: number
  cloudRamLimit: number
  /** Null when home upgrades are unavailable. */
  home: { ram: number; cores: number } | null
  /** Most recent purchases, newest first. */
  recent: { at: number; purchase: Purchase }[]
}

export function isPurchaserStatus(value: unknown): value is PurchaserStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PurchaserStatus).updatedAt === 'number' &&
    typeof (value as PurchaserStatus).done === 'boolean' &&
    Array.isArray((value as PurchaserStatus).cloudRams)
  )
}

/** What the sharer is doing right now. */
export interface SharerStatus {
  updatedAt: number
  /** Share threads running now. */
  threads: number
  /** Game's share power with them, as a multiplier on reputation gain. */
  power: number
  message: string
}

export function isSharerStatus(value: unknown): value is SharerStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SharerStatus).updatedAt === 'number' &&
    typeof (value as SharerStatus).threads === 'number'
  )
}
