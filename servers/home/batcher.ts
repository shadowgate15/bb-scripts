import { GAP_MS, SPACING_MS, sizeBatch } from '@/lib/batch'
import { entry } from '@/lib/entry'
import { planPrep } from '@/lib/prep'
import type { RunParams } from '@/lib/runner/protocol'
import { run, runAll } from '@/lib/runner/run'
import { BATCHER_STATUS_PORT, type BatcherStatus } from '@/lib/status/protocol'
import { explainTargets, rankTargets } from '@/lib/target/client'
import type { TargetInfo } from '@/lib/target/protocol'

/** A new target must score this many times the current one to replace it. */
const SWITCH_RATIO = 1.5
/** Tolerance when deciding the target is prepped enough to batch. */
const SECURITY_SLACK = 0.1
const MONEY_FLOOR = 0.98
/** Extra wait past a script's finish time, in ms. */
const FINISH_BUFFER_MS = 200
const IDLE_MS = 5_000

/**
 * Prepares a target, then launches overlapping hack/weaken/grow/weaken batches
 * that land in that order, each GAP_MS apart. The target is sticky: it only
 * changes while nothing is in flight, and only for one that scores clearly
 * better. Whenever nothing is in flight the target is re-checked too, so drift
 * gets corrected instead of compounding. Publishes its state on
 * BATCHER_STATUS_PORT for the status view.
 */
export const main = entry(async (ns) => {
  ns.ui.openTail()
  ns.disableLog('ALL')

  let info: TargetInfo | null = null
  let busyUntil = 0
  let batchId = 0
  let lastReport = ''
  /** When each in-flight batch lands. */
  let landings: number[] = []

  const status: BatcherStatus = {
    updatedAt: 0,
    phase: 'searching',
    target: null,
    fraction: null,
    sizes: null,
    estIncomePerSec: 0,
    batchesLaunched: 0,
    inFlight: 0,
    prepReadyAt: null,
    message: 'starting',
  }

  const publish = (patch: Partial<BatcherStatus>) => {
    const now = Date.now()

    landings = landings.filter((t) => t > now)
    Object.assign(status, patch, {
      updatedAt: now,
      batchesLaunched: batchId,
      inFlight: landings.length,
    })

    const port = ns.getPortHandle(BATCHER_STATUS_PORT)

    port.clear()
    port.write({ ...status })
  }

  while (true) {
    // Mid-flight readings are meaningless, so only inspect when nothing's running.
    if (Date.now() >= busyUntil) {
      const ranked = await rankTargets()
      const next = chooseTarget(ranked, info?.host ?? null)

      if (next === null) {
        lastReport = await reportNoTarget(ns, lastReport)
        publish({
          phase: 'searching',
          target: null,
          message: lastReport.split('\n')[0],
        })
        await ns.sleep(IDLE_MS)
        continue
      }

      if (next.host !== info?.host) {
        ns.print(`target: ${info?.host ?? 'none'} -> ${next.host}`)
      }

      info = next

      const prep = planPrep(info.host, SECURITY_SLACK, MONEY_FLOOR)

      if (prep !== null) {
        // All at once when it fits; otherwise one step at a time.
        const { ok } = await runAll(prep.combined)
        const launched = ok ? 1 : (await run(prep.fallback)).launched
        const what = ok ? 'grow+weaken' : prep.fallback.script

        ns.print(
          `prep ${info.host}: ${what} (${launched > 0 ? 'launched' : 'no RAM'})`,
        )
        publish({
          phase: 'prepping',
          target: info.host,
          fraction: info.fraction,
          sizes: null,
          estIncomePerSec: info.incomePerSec,
          prepReadyAt: launched > 0 ? Date.now() + prep.ms : null,
          message:
            launched > 0 ? `prepping with ${what}` : 'prep waiting for RAM',
        })
        await ns.sleep(launched > 0 ? prep.ms + FINISH_BUFFER_MS : IDLE_MS)
        continue
      }
    }

    if (info === null) continue

    const batch = planBatch(ns, info.host, batchId, info.fraction)

    if (batch === null) {
      ns.print(`${info.host}: too little money to batch`)
      publish({
        phase: 'searching',
        message: `${info.host}: too small to batch`,
      })
      await ns.sleep(IDLE_MS)
      continue
    }

    const { ok } = await runAll(batch.jobs)

    if (ok) {
      batchId++
      busyUntil = Date.now() + batch.durationMs + FINISH_BUFFER_MS
      landings.push(Date.now() + batch.durationMs)
    }

    publish({
      phase: ok ? 'batching' : 'waiting',
      target: info.host,
      fraction: info.fraction,
      sizes: batch.sizes,
      estIncomePerSec: info.incomePerSec,
      prepReadyAt: null,
      message: ok
        ? 'launching batches'
        : 'pool full, waiting for batches to land',
    })

    await ns.sleep(SPACING_MS)
  }
})

/** Logs why nothing is hackable, unless it's the same as last time. */
async function reportNoTarget(ns: NS, last: string): Promise<string> {
  const { rooted, poolRam, rejected } = await explainTargets()
  const lines = [
    `no hackable target: ${rooted} rooted, ${poolRam.toFixed(1)}GB pool RAM`,
    ...rejected.slice(0, 5).map((r) => `  ${r.host}: ${r.reason}`),
  ]

  if (rejected.length > 5) lines.push(`  ...and ${rejected.length - 5} more`)

  const report = lines.join('\n')

  if (report !== last) ns.print(report)

  return report
}

/** Keeps `current` unless the best-ranked target beats it by SWITCH_RATIO. */
function chooseTarget(
  ranked: TargetInfo[],
  current: string | null,
): TargetInfo | null {
  const best = ranked[0]

  if (best === undefined) return null

  const keep = ranked.find((t) => t.host === current)

  return keep !== undefined && best.score < keep.score * SWITCH_RATIO
    ? keep
    : best
}

interface Batch {
  jobs: RunParams[]
  sizes: NonNullable<ReturnType<typeof sizeBatch>>
  /** From launch until the last job lands, in ms. */
  durationMs: number
}

/**
 * Lays out one hack/weaken/grow/weaken batch stealing `fraction` of max money.
 * Landing order, relative to the weaken time W: hack at W-gap, weaken at W,
 * grow at W+gap, weaken at W+2gap. Each job starts later by (landing time -
 * its own run time).
 */
function planBatch(
  ns: NS,
  target: string,
  id: number,
  fraction: number,
): Batch | null {
  const sizes = sizeBatch(target, fraction)

  if (sizes === null) return null

  const weakenMs = ns.getWeakenTime(target)
  const job = (
    script: string,
    threads: number,
    runMs: number,
    landsAt: number,
  ): RunParams => ({
    script,
    threads,
    args: [target, landsAt - runMs, id],
  })

  return {
    sizes,
    jobs: [
      job(
        'workers/hack.js',
        sizes.hack,
        ns.getHackTime(target),
        weakenMs - GAP_MS,
      ),
      job('workers/weaken.js', sizes.weakenAfterHack, weakenMs, weakenMs),
      job(
        'workers/grow.js',
        sizes.grow,
        ns.getGrowTime(target),
        weakenMs + GAP_MS,
      ),
      job(
        'workers/weaken.js',
        sizes.weakenAfterGrow,
        weakenMs,
        weakenMs + 2 * GAP_MS,
      ),
    ],
    durationMs: weakenMs + 2 * GAP_MS,
  }
}
