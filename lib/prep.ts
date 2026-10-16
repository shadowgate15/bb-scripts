import { getNs } from '@ns'
import type { RunParams } from './runner/protocol'

export interface PrepPlan {
  /**
   * Grow plus the weaken that cancels its security and clears the existing
   * excess, all launched together. Finishes in one weaken time. When sized for
   * home's cores these are pinned to home.
   */
  combined: RunParams[]
  /** Just the single next step (1 core, anywhere), for when `combined` doesn't fit. */
  fallback: RunParams
  /** Time until the slowest job finishes, in ms. */
  ms: number
}

/** RAM available to prep: the whole pool, and home alone (where cores apply). */
export interface PrepRam {
  pool: number
  home: number
}

interface PrepThreads {
  weaken: number
  grow: number
}

/**
 * Threads that bring `target` to min security and max money in one go, with
 * grow and weaken sized for `cores` (more than 1 only holds on home).
 */
function prepThreads(
  target: string,
  cores: number,
  excess: number,
  money: number,
): PrepThreads {
  const ns = getNs()
  const maxMoney = ns.getServerMaxMoney(target)
  const grow =
    money < maxMoney
      ? Math.ceil(
          ns.growthAnalyze(target, maxMoney / Math.max(money, 1), cores),
        )
      : 0
  const growSecurity =
    grow > 0 ? ns.growthAnalyzeSecurity(grow, target, cores) : 0
  const weaken = Math.ceil(
    (Math.max(excess, 0) + growSecurity) / ns.weakenAnalyze(1, cores),
  )

  return { weaken, grow }
}

function prepRam({ weaken, grow }: PrepThreads): number {
  const ns = getNs()

  return (
    weaken * ns.getScriptRam('workers/weaken.js', 'home') +
    grow * ns.getScriptRam('workers/grow.js', 'home')
  )
}

/**
 * Whether prep is better pinned to home's cores. The batch is smaller there but
 * can only use home's RAM, so it wins only when it needs no more rounds of
 * `ram` than the same prep spread across the pool.
 */
function chooseCores(
  target: string,
  ram: PrepRam,
  excess: number,
  money: number,
): { cores: number; threads: PrepThreads; rounds: number } {
  const ns = getNs()
  const cores = ns.getServer('home').cpuCores
  const spread = prepThreads(target, 1, excess, money)
  const spreadRounds = Math.max(1, Math.ceil(prepRam(spread) / ram.pool))

  if (cores > 1) {
    const pinned = prepThreads(target, cores, excess, money)
    const pinnedRounds = Math.max(1, Math.ceil(prepRam(pinned) / ram.home))

    if (pinnedRounds <= spreadRounds) {
      return { cores, threads: pinned, rounds: pinnedRounds }
    }
  }

  return { cores: 1, threads: spread, rounds: spreadRounds }
}

/** Rounds of one weaken time that prepping `target` takes with our RAM; 0 if already prepped. */
export function prepRounds(target: string, ram: PrepRam): number {
  const ns = getNs()
  const excess =
    ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)
  const money = ns.getServerMoneyAvailable(target)
  const { threads, rounds } = chooseCores(target, ram, excess, money)

  return threads.weaken + threads.grow > 0 ? rounds : 0
}

/**
 * What it takes to move `target` toward min security and max money, or null
 * once it is within `securitySlack` and `moneyFloor`.
 */
export function planPrep(
  target: string,
  securitySlack: number,
  moneyFloor: number,
  ram: PrepRam,
): PrepPlan | null {
  const ns = getNs()
  const excess =
    ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)
  const needWeaken = excess > securitySlack
  const maxMoney = ns.getServerMaxMoney(target)
  const money = ns.getServerMoneyAvailable(target)
  const needGrow = money < maxMoney * moneyFloor

  if (!needWeaken && !needGrow) return null

  const job = (script: string, threads: number, host?: string): RunParams => ({
    script,
    threads,
    args: [target],
    host,
  })
  const chosen = chooseCores(target, ram, excess, needGrow ? money : maxMoney)
  const host = chosen.cores > 1 ? 'home' : undefined
  const combined: RunParams[] = [
    job('workers/weaken.js', chosen.threads.weaken, host),
  ]

  if (chosen.threads.grow > 0) {
    combined.push(job('workers/grow.js', chosen.threads.grow, host))
  }

  // One plain 1-core step for when the combined plan doesn't fit.
  const step = prepThreads(target, 1, excess, needGrow ? money : maxMoney)
  const fallback = needWeaken
    ? job('workers/weaken.js', Math.ceil(excess / ns.weakenAnalyze(1)))
    : job('workers/grow.js', step.grow)

  return { combined, fallback, ms: ns.getWeakenTime(target) }
}
