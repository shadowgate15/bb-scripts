import { getNs } from '@ns'
import { HOME_RESERVED_RAM } from './constants/ram'

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
  /**
   * Cores grow and weaken are sized for. Above 1 they only reach that size on
   * home, so the batcher pins them there; at 1 they may run anywhere.
   */
  homeCores: number
  /** Batches that fit at once: limited by RAM and by how long a batch runs. */
  inFlight: number
  incomePerSec: number
}

/** What a batch against `target` yields once it is at minimum security. */
interface PreppedView {
  /** Share of max money one hack thread steals. */
  hackPercent: number
  hackChance: number
  weakenMs: number
}

/**
 * Hack yield, hack chance and weaken time at the target's minimum security.
 * With Formulas.exe these are exact (for a server at min security and max
 * money). Without it they are scaled from the current readings: yield and
 * chance both scale with (100 - security), weaken time with the game's
 * `2.5 * required level * security + 500`.
 */
function preppedView(target: string): PreppedView {
  const ns = getNs()

  if (ns.fileExists('Formulas.exe', 'home')) {
    const server = ns.getServer(target)
    const prepped = {
      ...server,
      hackDifficulty: server.minDifficulty,
      moneyAvailable: server.moneyMax,
    }
    const player = ns.getPlayer()

    return {
      hackPercent: ns.formulas.hacking.hackPercent(prepped, player),
      hackChance: ns.formulas.hacking.hackChance(prepped, player),
      weakenMs: ns.formulas.hacking.weakenTime(prepped, player),
    }
  }

  const current = ns.getServerSecurityLevel(target)
  const min = ns.getServerMinSecurityLevel(target)
  const boost = current >= 100 ? 1 : (100 - min) / (100 - current)
  const required = ns.getServerRequiredHackingLevel(target)
  const at = (security: number) => 2.5 * required * security + 500

  return {
    hackPercent: ns.hackAnalyze(target) * boost,
    hackChance: Math.min(1, ns.hackAnalyzeChance(target) * boost),
    weakenMs: (ns.getWeakenTime(target) * at(min)) / at(current),
  }
}

/** Cores on home, which boost grow and weaken threads run there. */
export function homeCoreCount(): number {
  return getNs().getServer('home').cpuCores
}

/**
 * Sizes a batch stealing `fraction` of max money, or null if that's under one
 * hack thread. Grow and weaken are sized for `cores`, so with more than 1 they
 * must run on home or they fall short.
 */
export function sizeBatch(
  target: string,
  fraction: number,
  cores = 1,
  stolenPerThread = preppedView(target).hackPercent,
): BatchSizes | null {
  const ns = getNs()
  // Sized from the share one thread steals, not `hackAnalyzeThreads`, which
  // returns -1 whenever the server holds less money than asked for (so for any
  // server that still needs growing).
  // `stolenPerThread` is judged at minimum security, where a batch runs.
  const hack = stolenPerThread > 0 ? Math.floor(fraction / stolenPerThread) : 0

  if (hack < 1) return null

  const grow = Math.ceil(ns.growthAnalyze(target, 1 / (1 - fraction), cores))
  const weakenPerThread = ns.weakenAnalyze(1, cores)

  return {
    hack,
    weakenAfterHack: Math.ceil(
      ns.hackAnalyzeSecurity(hack, target) / weakenPerThread,
    ),
    grow,
    weakenAfterGrow: Math.ceil(
      ns.growthAnalyzeSecurity(grow, target, cores) / weakenPerThread,
    ),
  }
}

/** RAM the grow and weaken threads of one batch hold, in GB. */
export function growWeakenRam(sizes: BatchSizes): number {
  const ns = getNs()

  return (
    sizes.grow * ns.getScriptRam('workers/grow.js', 'home') +
    (sizes.weakenAfterHack + sizes.weakenAfterGrow) *
      ns.getScriptRam('workers/weaken.js', 'home')
  )
}

/** RAM one batch holds while in flight, in GB. */
export function batchRam(sizes: BatchSizes): number {
  return (
    sizes.hack * getNs().getScriptRam('workers/hack.js', 'home') +
    growWeakenRam(sizes)
  )
}

/**
 * Picks the hack fraction that earns the most from `poolRam`, or says why none
 * works. Hack yield, hack chance and weaken time are all taken at the target's
 * minimum security, so an unprepped target isn't marked down for being unprepped
 * (that cost is charged separately as prep time).
 */
export function chooseBatch(
  target: string,
  poolRam: number,
): BatchPlan | { reason: string } {
  const ns = getNs()
  const maxMoney = ns.getServerMaxMoney(target)
  const { hackPercent, hackChance, weakenMs } = preppedView(target)
  const usableRam = poolRam * POOL_USE
  const homeRam = (ns.getServerMaxRam('home') - HOME_RESERVED_RAM) * POOL_USE
  const cores = homeCoreCount()
  // Unpinned (grow and weaken anywhere, sized for 1 core), and, if home has
  // spare cores, pinned to home (smaller batches, but only home's RAM for them).
  const coreOptions = cores > 1 ? [1, cores] : [1]
  let best: BatchPlan | null = null
  let smallestRam = Number.POSITIVE_INFINITY

  for (const homeCores of coreOptions) {
    for (const fraction of FRACTIONS) {
      const sizes = sizeBatch(target, fraction, homeCores, hackPercent)

      if (sizes === null) continue

      const ramPerBatch = batchRam(sizes)
      const inFlight = Math.min(
        Math.floor(weakenMs / SPACING_MS),
        Math.floor(usableRam / ramPerBatch),
        homeCores > 1
          ? Math.floor(homeRam / growWeakenRam(sizes))
          : Number.POSITIVE_INFINITY,
      )

      smallestRam = Math.min(smallestRam, ramPerBatch)

      if (inFlight < 1) continue

      // A failed hack steals nothing, but its grow and weaken still run.
      const incomePerSec =
        (inFlight * fraction * maxMoney * hackChance) / (weakenMs / 1000)

      if (best === null || incomePerSec > best.incomePerSec) {
        best = {
          fraction,
          sizes,
          ramPerBatch,
          homeCores,
          inFlight,
          incomePerSec,
        }
      }
    }
  }

  if (best !== null) return best

  return {
    reason: Number.isFinite(smallestRam)
      ? `a batch needs ${smallestRam.toFixed(1)}GB, pool has ${usableRam.toFixed(1)}GB usable`
      : 'a batch would hack under one thread',
  }
}
