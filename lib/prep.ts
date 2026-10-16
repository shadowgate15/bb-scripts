import { getNs } from '@ns'

/** One worker launch: script, threads wanted, and how long it runs in ms. */
export interface Step {
  script: string
  threads: number
  ms: number
}

/** Weaken threads needed per point of security (one thread removes 0.05). */
const SECURITY_PER_WEAKEN = 0.05

/**
 * The weaken or grow step that moves `target` toward min security and max
 * money, or null once it is within `securitySlack` and `moneyFloor`.
 */
export function prepStep(
  target: string,
  securitySlack: number,
  moneyFloor: number,
): Step | null {
  const ns = getNs()
  const security = ns.getServerSecurityLevel(target)
  const minSecurity = ns.getServerMinSecurityLevel(target)

  if (security > minSecurity + securitySlack) {
    return {
      script: 'workers/weaken.js',
      threads: Math.ceil((security - minSecurity) / SECURITY_PER_WEAKEN),
      ms: ns.getWeakenTime(target),
    }
  }

  const money = ns.getServerMoneyAvailable(target)
  const maxMoney = ns.getServerMaxMoney(target)

  if (money < maxMoney * moneyFloor) {
    return {
      script: 'workers/grow.js',
      threads: Math.ceil(
        ns.growthAnalyze(target, maxMoney / Math.max(money, 1)),
      ),
      ms: ns.getGrowTime(target),
    }
  }

  return null
}
