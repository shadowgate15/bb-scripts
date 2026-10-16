import { batchRam, HACK_FRACTION, SPACING_MS, sizeBatch } from '@/lib/batch'
import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { rootAll } from '@/lib/rooter/root-all'
import {
  type TargetInfo,
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
  const rank = async (): Promise<TargetInfo[]> => {
    const hosts = await rootAll()
    const poolRam = hosts.reduce(
      (sum, h) =>
        sum + ns.getServerMaxRam(h) - (h === 'home' ? HOME_RESERVED_RAM : 0),
      0,
    )
    const targets: TargetInfo[] = []

    for (const host of hosts) {
      const maxMoney = ns.getServerMaxMoney(host)

      if (maxMoney <= 0) continue
      if (
        ns.getServerRequiredHackingLevel(host) >
        ns.getHackingLevel() * LEVEL_SHARE
      ) {
        continue
      }

      const sizes = sizeBatch(host)

      if (sizes === null) continue

      const weakenMs = ns.getWeakenTime(host)
      const inFlight = Math.min(
        Math.floor(weakenMs / SPACING_MS),
        Math.floor(poolRam / batchRam(sizes)),
      )

      if (inFlight < 1) continue

      const incomePerSec =
        (inFlight * HACK_FRACTION * maxMoney) / (weakenMs / 1000)
      const prepMs = estimatePrepMs(host, poolRam, weakenMs)

      targets.push({
        host,
        maxMoney,
        minSecurity: ns.getServerMinSecurityLevel(host),
        prepMs,
        incomePerSec,
        score: (incomePerSec * HORIZON_S) / (HORIZON_S + prepMs / 1000),
      })
    }

    return targets.sort((a, b) => b.score - a.score)
  }

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
      best: async () => (await rank())[0]?.host ?? null,
    },
    { onError: (e) => ns.print(`target: ${e}`) },
  )
})
