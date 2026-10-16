import { getNs } from '@ns'

/** Gap between the four landings of one batch, in ms. */
export const GAP_MS = 50
/** A new batch starts this often; four gaps keeps landing windows apart. */
export const SPACING_MS = GAP_MS * 4
/**
 * Share of the pool's RAM batches may plan to fill. The rest absorbs
 * fragmentation across hosts and the prep jobs that run beside batches.
 */
const POOL_USE = 0.9
/**
 * Hack fractions to try, as a share of max money per batch. Income rises with
 * the fraction until the pool's RAM is full, then falls (grow cost climbs
 * faster than the haul), so the best one is where RAM just binds.
 */
const FRACTIONS = [
  0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
]

/** Thread counts for one hack/weaken/grow/weaken batch. */
export interface BatchSizes {
  hack: number
  weakenAfterHack: number
  grow: number
  weakenAfterGrow: number
}

/** The batch shape chosen for a target, and what it should earn. */
export interface BatchPlan {
  fraction: number
  sizes: BatchSizes
  ramPerBatch: number
  /** Batches that fit at once: limited by RAM and by how long a batch runs. */
  inFlight: number
  incomePerSec: number
}

/** Sizes a batch stealing `fraction` of max money, or null if that's under one hack thread. */
export function sizeBatch(target: string, fraction: number): BatchSizes | null {
  const ns = getNs()
  // Sized from the share one thread steals, not `hackAnalyzeThreads`, which
  // returns -1 whenever the server holds less money than asked for (so for any
  // server that still needs growing).
  const stolenPerThread = ns.hackAnalyze(target)
  const hack = stolenPerThread > 0 ? Math.floor(fraction / stolenPerThread) : 0

  if (hack < 1) return null

  const grow = Math.ceil(ns.growthAnalyze(target, 1 / (1 - fraction)))
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

/**
 * Picks the hack fraction that earns the most from `poolRam`, or says why none
 * works. Batches are sized at the target's current security, so call this for
 * a prepped target (or accept a slightly pessimistic answer for one that isn't).
 */
export function chooseBatch(
  target: string,
  poolRam: number,
): BatchPlan | { reason: string } {
  const ns = getNs()
  const maxMoney = ns.getServerMaxMoney(target)
  const weakenMs = ns.getWeakenTime(target)
  const usableRam = poolRam * POOL_USE
  let best: BatchPlan | null = null
  let smallestRam = Number.POSITIVE_INFINITY

  for (const fraction of FRACTIONS) {
    const sizes = sizeBatch(target, fraction)

    if (sizes === null) continue

    const ramPerBatch = batchRam(sizes)
    const inFlight = Math.min(
      Math.floor(weakenMs / SPACING_MS),
      Math.floor(usableRam / ramPerBatch),
    )

    smallestRam = Math.min(smallestRam, ramPerBatch)

    if (inFlight < 1) continue

    const incomePerSec = (inFlight * fraction * maxMoney) / (weakenMs / 1000)

    if (best === null || incomePerSec > best.incomePerSec) {
      best = { fraction, sizes, ramPerBatch, inFlight, incomePerSec }
    }
  }

  if (best !== null) return best

  return {
    reason: Number.isFinite(smallestRam)
      ? `a batch needs ${smallestRam.toFixed(1)}GB, pool has ${usableRam.toFixed(1)}GB usable`
      : 'a batch would hack under one thread',
  }
}
