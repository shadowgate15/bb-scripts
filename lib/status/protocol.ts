import type { BatchSizes } from '../batch'

/**
 * Port the batcher keeps its latest snapshot on (clear + write). Readers
 * `peek` it; no one consumes it. Below port-rpc's range, so it can't collide.
 */
export const BATCHER_STATUS_PORT = 100

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

/** What the batcher is doing right now. Shared with whatever displays it. */
export interface BatcherStatus {
  updatedAt: number
  phase: BatcherPhase
  target: string | null
  /** Share of max money each batch steals. */
  fraction: number | null
  sizes: BatchSizes | null
  /** Income the target service expects from this target, per second. */
  estIncomePerSec: number
  batchesLaunched: number
  inFlight: number
  /** Threads in the prep step now running, while prepping. */
  prepThreads: { weaken: number; grow: number } | null
  /** Epoch ms the current prep step finishes, while prepping. */
  prepReadyAt: number | null
  message: string
}

export function isBatcherStatus(value: unknown): value is BatcherStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BatcherStatus).updatedAt === 'number' &&
    typeof (value as BatcherStatus).phase === 'string'
  )
}
