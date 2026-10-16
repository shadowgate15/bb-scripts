import { getNs } from '@ns'

/** Gap between the four landings of one batch, in ms. */
export const GAP_MS = 50
/** A new batch starts this often; four gaps keeps landing windows apart. */
export const SPACING_MS = GAP_MS * 4
/** Share of max money each batch steals. */
export const HACK_FRACTION = 0.1

/** Thread counts for one hack/weaken/grow/weaken batch. */
export interface BatchSizes {
  hack: number
  weakenAfterHack: number
  grow: number
  weakenAfterGrow: number
}

/** Sizes a batch for `target`, or null if HACK_FRACTION of its money is under one thread. */
export function sizeBatch(target: string): BatchSizes | null {
  const ns = getNs()
  const hack = Math.floor(
    ns.hackAnalyzeThreads(target, ns.getServerMaxMoney(target) * HACK_FRACTION),
  )

  if (hack < 1) return null

  const grow = Math.ceil(ns.growthAnalyze(target, 1 / (1 - HACK_FRACTION)))
  const weakenPerThread = ns.weakenAnalyze(1)

  return {
    hack,
    weakenAfterHack: Math.ceil(
      ns.hackAnalyzeSecurity(hack, target) / weakenPerThread,
    ),
    grow,
    weakenAfterGrow: Math.ceil(
      ns.growthAnalyzeSecurity(grow, target) / weakenPerThread,
    ),
  }
}

/** RAM one batch holds while in flight, in GB. */
export function batchRam(sizes: BatchSizes): number {
  const ns = getNs()
  const weakenRam = ns.getScriptRam('workers/weaken.js', 'home')

  return (
    sizes.hack * ns.getScriptRam('workers/hack.js', 'home') +
    sizes.grow * ns.getScriptRam('workers/grow.js', 'home') +
    (sizes.weakenAfterHack + sizes.weakenAfterGrow) * weakenRam
  )
}
