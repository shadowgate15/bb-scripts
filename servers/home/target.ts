import { chooseBatch } from '@/lib/batch'
import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { rootAll } from '@/lib/rooter/root-all'
import {
  type TargetInfo,
  type TargetReport,
  type TargetRpc,
  targetChannel,
} from '@/lib/target/protocol'

/** Only target servers needing at most this share of our hacking level. */
const LEVEL_SHARE = 0.5
/**
 * Income is judged over this long: a target that takes most of it to prep
 * scores near zero, one that is already prepped keeps its full income.
 */
const HORIZON_S = 900
const SECURITY_PER_WEAKEN = 0.05

/**
 * Ranks rooted servers by what they would earn us: batching income given the
 * RAM we have, discounted by how long they still need to be prepped.
 */
export const main = entry(async (ns) => {
  /** Scores every rooted server, noting why each rejected one was skipped. */
  const evaluate = async (): Promise<
    TargetReport & { targets: TargetInfo[] }
  > => {
    const hosts = await rootAll()
    const poolRam = hosts.reduce(
      (sum, h) =>
        sum + ns.getServerMaxRam(h) - (h === 'home' ? HOME_RESERVED_RAM : 0),
      0,
    )
    const targets: TargetInfo[] = []
    const rejected: TargetReport['rejected'] = []
    const reject = (host: string, reason: string) =>
      rejected.push({ host, reason })

    for (const host of hosts) {
      const maxMoney = ns.getServerMaxMoney(host)

      if (maxMoney <= 0) {
        reject(host, 'has no money')
        continue
      }

      const required = ns.getServerRequiredHackingLevel(host)
      const limit = ns.getHackingLevel() * LEVEL_SHARE

      if (required > limit) {
        reject(
          host,
          `needs hacking ${required}, limit is ${limit} (${LEVEL_SHARE} x level ${ns.getHackingLevel()})`,
        )
        continue
      }

      const plan = chooseBatch(host, poolRam)

      if ('reason' in plan) {
        reject(host, plan.reason)
        continue
      }

      const weakenMs = ns.getWeakenTime(host)
      const { incomePerSec } = plan
      const prepMs = estimatePrepMs(host, poolRam, weakenMs)

      targets.push({
        host,
        maxMoney,
        minSecurity: ns.getServerMinSecurityLevel(host),
        prepMs,
        incomePerSec,
        fraction: plan.fraction,
        inFlight: plan.inFlight,
        score: (incomePerSec * HORIZON_S) / (HORIZON_S + prepMs / 1000),
      })
    }

    targets.sort((a, b) => b.score - a.score)

    return { rooted: hosts.length, poolRam, rejected, targets }
  }

  const rank = async () => (await evaluate()).targets

  /** Rounds of weaken+grow the pool needs, each taking one weaken time. */
  const estimatePrepMs = (
    host: string,
    poolRam: number,
    weakenMs: number,
  ): number => {
    const money = ns.getServerMoneyAvailable(host)
    const maxMoney = ns.getServerMaxMoney(host)
    const grow =
      money < maxMoney
        ? Math.ceil(ns.growthAnalyze(host, maxMoney / Math.max(money, 1)))
        : 0
    const excess =
      ns.getServerSecurityLevel(host) -
      ns.getServerMinSecurityLevel(host) +
      (grow > 0 ? ns.growthAnalyzeSecurity(grow, host) : 0)
    const weaken = Math.ceil(excess / SECURITY_PER_WEAKEN)

    if (grow + weaken <= 0) return 0

    const ram =
      grow * ns.getScriptRam('workers/grow.js', 'home') +
      weaken * ns.getScriptRam('workers/weaken.js', 'home')

    return Math.max(1, Math.ceil(ram / poolRam)) * weakenMs
  }

  await serve<TargetRpc>(
    targetChannel,
    {
      rank: async (params) => (await rank()).slice(0, params?.limit),
      explain: async () => {
        const { targets: _, ...report } = await evaluate()

        return report
      },
      best: async () => (await rank())[0]?.host ?? null,
    },
    { onError: (e) => ns.print(`target: ${e}`) },
  )
})
