import { type BatchPlan, chooseBatch } from '@/lib/batch'
import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'
import { rootAll } from '@/lib/network/client'
import { serve } from '@/lib/port-rpc/server'
import { type PrepRam, planPrep, prepRounds } from '@/lib/prep'
import {
  type SkippedTarget,
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
/** A kept target must be out-scored by this factor before it is replaced. */
const SWITCH_RATIO = 1.5
/** A target sharing the pool must earn at least this share of the best one's income. */
const MIN_LANE_SHARE = 0.05
/** Candidates past the lane limit are listed only this far, to keep logs short. */
const SKIPPED_SHOWN = 8

/**
 * Ranks rooted servers by what they would earn us: batching income given the
 * RAM we have, discounted by how long they still need to be prepped.
 */
export const main = entry(async (ns) => {
  /** A target's ranking entry for `plan`, discounted by the prep it needs. */
  const describe = (
    host: string,
    plan: BatchPlan,
    ram: PrepRam,
  ): TargetInfo => {
    const prepMs = prepRounds(host, ram) * ns.getWeakenTime(host)

    return {
      host,
      maxMoney: ns.getServerMaxMoney(host),
      minSecurity: ns.getServerMinSecurityLevel(host),
      prepMs,
      incomePerSec: plan.incomePerSec,
      fraction: plan.fraction,
      homeCores: plan.homeCores,
      sizes: plan.sizes,
      inFlight: plan.inFlight,
      ramUse: plan.ramUse,
      homeUse: plan.homeUse,
      score: (plan.incomePerSec * HORIZON_S) / (HORIZON_S + prepMs / 1000),
    }
  }

  /** Scores every rooted server, noting why each rejected one was skipped. */
  const evaluate = async (): Promise<
    TargetReport & { targets: TargetInfo[] }
  > => {
    const hosts = await rootAll()
    const ram = prepRamFor(hosts)
    const poolRam = ram.pool
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

      targets.push(describe(host, plan, ram))
    }

    targets.sort((a, b) => b.score - a.score)

    return { rooted: hosts.length, poolRam, rejected, targets }
  }

  /** RAM across `hosts` for scripts, and home's share of it. */
  const prepRamFor = (hosts: string[]): PrepRam => {
    const usable = (h: string) =>
      ns.getServerMaxRam(h) - (h === 'home' ? HOME_RESERVED_RAM : 0)

    return {
      pool: hosts.reduce((sum, h) => sum + usable(h), 0),
      home: usable('home'),
    }
  }

  /**
   * Fills the pool best target first. Each later target is planned against what
   * the earlier ones leave, so a pool too big for one target spills onto the next.
   */
  const allocate = async (limit: number, keep: string[]) => {
    const { targets } = await evaluate()
    const ram = prepRamFor(await rootAll())
    const biased = (t: TargetInfo) =>
      t.score * (keep.includes(t.host) ? SWITCH_RATIO : 1)
    const lanes: TargetInfo[] = []
    const skipped: SkippedTarget[] = []
    let pool = ram.pool
    let home = ram.home

    for (const t of targets.toSorted((a, b) => biased(b) - biased(a))) {
      // Only the leading candidates are worth explaining.
      const skip = (reason: string) => {
        if (skipped.length < SKIPPED_SHOWN) {
          skipped.push({ host: t.host, score: t.score, reason })
        }
      }

      if (lanes.length >= limit) {
        skip('lane limit')
        continue
      }

      // The first gets the whole pool, which is how it was already planned.
      let next = t

      if (lanes.length > 0) {
        const plan = chooseBatch(t.host, pool, home)

        if ('reason' in plan) {
          skip(`no fit in the remaining RAM: ${plan.reason}`)
          continue
        }

        next = describe(t.host, plan, ram)

        if (next.incomePerSec < lanes[0].incomePerSec * MIN_LANE_SHARE) {
          skip(
            `earns $${next.incomePerSec.toPrecision(3)}/s in the remaining RAM, under ${MIN_LANE_SHARE * 100}% of the best`,
          )
          continue
        }
      }

      lanes.push(next)
      pool -= next.ramUse
      home -= next.homeUse
    }

    return { lanes, skipped }
  }

  const rank = async () => (await evaluate()).targets

  await serve<TargetRpc>(
    targetChannel,
    {
      rank: async (params) => (await rank()).slice(0, params?.limit),
      lanes: ({ limit, keep }) => allocate(limit, keep),
      explain: async () => {
        const { targets: _, ...report } = await evaluate()

        return report
      },
      prep: async ({ host, securitySlack, moneyFloor }) =>
        planPrep(host, securitySlack, moneyFloor, prepRamFor(await rootAll())),
      best: async () => (await rank())[0]?.host ?? null,
    },
    { onError: (e) => ns.print(`target: ${e}`) },
  )
})
