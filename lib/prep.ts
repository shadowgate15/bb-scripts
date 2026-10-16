import { getNs } from '@ns'
import type { RunParams } from './runner/protocol'

/** Weaken threads needed per point of security (one thread removes 0.05). */
const SECURITY_PER_WEAKEN = 0.05

export interface PrepPlan {
  /**
   * Grow plus the weaken that cancels its security and clears the existing
   * excess, all launched together. Finishes in one weaken time.
   */
  combined: RunParams[]
  /** Just the single next step, for when `combined` doesn't fit in RAM. */
  fallback: RunParams
  /** Time until the slowest job finishes, in ms. */
  ms: number
}

/**
 * What it takes to move `target` toward min security and max money, or null
 * once it is within `securitySlack` and `moneyFloor`.
 */
export function planPrep(
  target: string,
  securitySlack: number,
  moneyFloor: number,
): PrepPlan | null {
  const ns = getNs()
  const excess =
    ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)
  const needWeaken = excess > securitySlack
  const maxMoney = ns.getServerMaxMoney(target)
  const money = ns.getServerMoneyAvailable(target)
  const needGrow = money < maxMoney * moneyFloor

  if (!needWeaken && !needGrow) return null

  const job = (script: string, threads: number): RunParams => ({
    script,
    threads,
    args: [target],
  })
  const weaken = (securityToRemove: number) =>
    job('workers/weaken.js', Math.ceil(securityToRemove / SECURITY_PER_WEAKEN))

  const growThreads = needGrow
    ? Math.ceil(ns.growthAnalyze(target, maxMoney / Math.max(money, 1)))
    : 0
  const growSecurity =
    growThreads > 0 ? ns.growthAnalyzeSecurity(growThreads, target) : 0
  const combined: RunParams[] = []

  combined.push(weaken(Math.max(excess, 0) + growSecurity))

  if (growThreads > 0) {
    combined.push(job('workers/grow.js', growThreads))
  }

  return {
    combined,
    fallback: needWeaken ? weaken(excess) : job('workers/grow.js', growThreads),
    ms: ns.getWeakenTime(target),
  }
}
