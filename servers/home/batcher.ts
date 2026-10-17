import { type BatchSizes, GAP_MS, SPACING_MS } from '@/lib/batch'
import { entry } from '@/lib/entry'
import type { RunParams } from '@/lib/runner/protocol'
import { killPids, run, runAll } from '@/lib/runner/run'
import {
  BATCHER_STATUS_PORT,
  type BatcherPhase,
  type BatcherStatus,
  type LaneStatus,
} from '@/lib/status/protocol'
import {
  allocateTargets,
  explainTargets,
  planTargetPrep,
} from '@/lib/target/client'
import type { TargetInfo } from '@/lib/target/protocol'

/** Most targets hacked at once; a pool too small for a second one runs just one. */
const MAX_LANES = 4
/** Tolerance when deciding the target is prepped enough to batch. */
const SECURITY_SLACK = 0.1
const MONEY_FLOOR = 0.98
/** Extra wait past a script's finish time, in ms. */
const FINISH_BUFFER_MS = 200
const IDLE_MS = 5_000
/**
 * How often to re-plan the targets. A target dropped from the plan stops
 * launching and drains (about one weaken time with no income), so the target
 * service only drops one for a clearly better candidate; looking is cheap.
 */
const RECHECK_MS = 60_000

/** One target being prepped or batched, and what is in flight against it. */
interface Lane {
  info: TargetInfo
  phase: LaneStatus['phase']
  /** Nothing of this lane is in flight past this time. */
  busyUntil: number
  /** The lane does nothing before this: a prep wait, or a retry for RAM. */
  wakeAt: number
  /** Dropped from the plan: lands what is in flight, then goes. */
  retired: boolean
  /** When each in-flight batch lands. */
  landings: number[]
  launched: number
  sizes: BatchSizes | null
  prepThreads: LaneStatus['prepThreads']
  prepReadyAt: number | null
  message: string
}

/**
 * Hacks up to MAX_LANES targets at once, the pool split between them by the
 * target service. Each lane prepares its target, then launches overlapping
 * hack/weaken/grow/weaken batches that land in that order, each GAP_MS apart.
 * Lanes are sticky: the plan is re-read every RECHECK_MS and a lane only
 * retires when the plan drops its target, then lands its batches before going.
 * Publishes its state on BATCHER_STATUS_PORT for the status view.
 *
 * Lanes take turns within one loop rather than running concurrently, since a
 * script may have only one `ns.sleep` pending.
 */
export const main = entry(async (ns) => {
  ns.ui.openTail()
  ns.disableLog('ALL')

  let lanes: Lane[] = []
  let nextPlan = 0
  let lastReport = ''
  let searchMessage = 'starting'

  const publish = () => {
    const now = Date.now()
    const statuses = lanes.map((lane): LaneStatus => {
      lane.landings = lane.landings.filter((t) => t > now)

      return {
        target: lane.info.host,
        phase: lane.phase,
        fraction: lane.info.fraction,
        sizes: lane.sizes,
        homeCores: lane.sizes ? lane.info.homeCores : null,
        estIncomePerSec: lane.info.incomePerSec,
        batchesLaunched: lane.launched,
        inFlight: lane.landings.length,
        nextLandingAt:
          lane.landings.length > 0 ? Math.min(...lane.landings) : null,
        lastLandingAt:
          lane.landings.length > 0 ? Math.max(...lane.landings) : null,
        prepThreads: lane.prepThreads,
        prepReadyAt: lane.prepReadyAt,
        message: lane.message,
      }
    })
    const phase: BatcherPhase =
      statuses.find((s) => s.phase === 'batching')?.phase ??
      statuses[0]?.phase ??
      'searching'
    const status: BatcherStatus = {
      updatedAt: now,
      phase,
      lanes: statuses,
      plannedRam: lanes
        .filter((l) => !l.retired)
        .reduce((sum, l) => sum + l.info.ramUse, 0),
      // Only lanes past prep earn; the rest are still plans.
      estIncomePerSec: lanes
        .filter((l) => !l.retired && l.sizes !== null)
        .reduce((sum, l) => sum + l.info.incomePerSec, 0),
      batchesLaunched: statuses.reduce((sum, s) => sum + s.batchesLaunched, 0),
      inFlight: statuses.reduce((sum, s) => sum + s.inFlight, 0),
      message: statuses[0]?.message ?? searchMessage,
    }
    const port = ns.getPortHandle(BATCHER_STATUS_PORT)

    port.clear()
    port.write(status)
  }

  while (true) {
    if (Date.now() >= nextPlan) {
      lanes = await replan(ns, lanes)

      if (lanes.length === 0) {
        lastReport = await reportNoTarget(ns, lastReport)
        searchMessage = lastReport.split('\n')[0]
      }

      nextPlan =
        Date.now() + (lanes.some((l) => !l.retired) ? RECHECK_MS : IDLE_MS)
    }

    for (const lane of lanes) {
      if (Date.now() >= lane.wakeAt) await step(ns, lane)
    }

    // A retired lane is gone once its last batch has landed.
    const now = Date.now()

    lanes = lanes.filter(
      (l) =>
        !(l.retired && now >= l.busyUntil && l.landings.every((t) => t <= now)),
    )
    publish()
    await ns.sleep(SPACING_MS)
  }
})

/** The last plan logged, so an unchanged plan isn't logged again. */
let lastPlan = ''

/**
 * Applies the target service's plan to the running lanes: keeps and refreshes
 * the ones it still wants, retires the rest, and adds lanes for new targets.
 */
async function replan(ns: NS, lanes: Lane[]): Promise<Lane[]> {
  const keep = lanes.filter((l) => !l.retired).map((l) => l.info.host)
  const wanted = await allocateTargets(MAX_LANES, keep)
  const summary = wanted
    .map(
      (t) =>
        `${t.host} score ${t.score.toPrecision(3)}, $${t.incomePerSec.toPrecision(3)}/s, prep ${Math.round(t.prepMs / 1000)}s, ${t.ramUse.toFixed(0)}GB`,
    )
    .join('\n  ')

  if (summary !== lastPlan) {
    ns.print(`plan (kept: ${keep.join(', ') || 'none'}):\n  ${summary}`)
    lastPlan = summary
  }

  for (const lane of lanes) {
    const info = wanted.find((t) => t.host === lane.info.host)

    if (info !== undefined) {
      lane.info = info
      lane.retired = false
    } else if (!lane.retired) {
      lane.retired = true
      lane.phase = 'retargeting'
      lane.message = 'dropped from the plan: draining batches'
      ns.print(`${lane.info.host}: dropped, draining batches`)
    }
  }

  for (const info of wanted) {
    if (lanes.some((l) => l.info.host === info.host)) continue

    ns.print(`target: + ${info.host}`)
    lanes.push({
      info,
      phase: 'prepping',
      busyUntil: 0,
      wakeAt: 0,
      retired: false,
      landings: [],
      launched: 0,
      sizes: null,
      prepThreads: null,
      prepReadyAt: null,
      message: 'starting',
    })
  }

  return lanes
}

/** Advances one lane: prep it if it needs that, otherwise launch a batch. */
async function step(ns: NS, lane: Lane): Promise<void> {
  const { info } = lane

  if (lane.retired) return

  // Mid-flight readings are meaningless, so only inspect when nothing's running.
  if (Date.now() >= lane.busyUntil) {
    const prep = await planTargetPrep(info.host, SECURITY_SLACK, MONEY_FLOOR)

    if (prep !== null) {
      // All at once when it fits; otherwise one step at a time.
      const { ok } = await runAll(prep.combined)
      const launched = ok ? 1 : (await run(prep.fallback)).launched
      const what = ok ? 'grow+weaken' : prep.fallback.script
      const jobs = ok ? prep.combined : [prep.fallback]
      const threadsOf = (script: string) =>
        jobs
          .filter((j) => j.script === script)
          .reduce((sum, j) => sum + j.threads, 0)
      const waitMs = launched > 0 ? prep.ms + FINISH_BUFFER_MS : IDLE_MS

      ns.print(
        `prep ${info.host}: ${what} (${launched > 0 ? 'launched' : 'no RAM'})`,
      )
      lane.phase = 'prepping'
      lane.sizes = null
      lane.prepThreads =
        launched > 0
          ? {
              weaken: threadsOf('workers/weaken.js'),
              grow: threadsOf('workers/grow.js'),
            }
          : null
      lane.prepReadyAt = launched > 0 ? Date.now() + prep.ms : null
      lane.message =
        launched > 0 ? `prepping with ${what}` : 'prep waiting for RAM'
      lane.wakeAt = Date.now() + waitMs
      lane.busyUntil = lane.wakeAt

      return
    }
  }

  const batch = planBatch(ns, info, lane.launched)

  const launch = await runAll(batch.jobs)
  let { ok } = launch

  if (ok && !landsInOrder(ns, info.host, batch)) {
    // Durations moved under us (a level-up, or security off its floor), so
    // the landings would be out of order and corrupt the target. Stop the
    // whole batch before anything lands.
    await killPids(launch.pids.flat())
    ns.print(
      `${info.host}: batch ${lane.launched} drifted out of order; killed`,
    )
    ok = false
  }

  if (ok) {
    lane.launched++
    lane.busyUntil = Date.now() + batch.durationMs + FINISH_BUFFER_MS
    lane.landings.push(Date.now() + batch.durationMs)
  }

  lane.phase = ok ? 'batching' : 'waiting'
  lane.sizes = batch.sizes
  lane.prepThreads = null
  lane.prepReadyAt = null
  lane.message = ok
    ? 'launching batches'
    : 'batch skipped, waiting for the next slot'
  lane.wakeAt = Date.now() + SPACING_MS
}

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

interface Batch {
  jobs: RunParams[]
  sizes: BatchSizes
  /** From launch until the last job lands, in ms. */
  durationMs: number
  /** Per job, in `jobs` order: the run time the plan assumed, and when it should land. */
  planned: { runMs: number; landsAt: number }[]
}

/** A landing must trail the previous one by at least this much to stay in order. */
const MIN_LANDING_GAP_MS = GAP_MS / 2

/**
 * Re-reads the run times after launch and checks the four landings still come
 * hack, weaken, grow, weaken. Each job's delay was fixed from the plan, so a
 * change in its run time moves its landing by the same amount.
 */
function landsInOrder(ns: NS, target: string, batch: Batch): boolean {
  const weakenMs = ns.getWeakenTime(target)
  const now = [
    ns.getHackTime(target),
    weakenMs,
    ns.getGrowTime(target),
    weakenMs,
  ]
  const landings = batch.planned.map((p, i) => p.landsAt + (now[i] - p.runMs))

  return landings.every(
    (t, i) => i === 0 || t - landings[i - 1] >= MIN_LANDING_GAP_MS,
  )
}

/**
 * Lays out one hack/weaken/grow/weaken batch, sized by the target service.
 * Landing order, relative to the weaken time W: hack at W-gap, weaken at W,
 * grow at W+gap, weaken at W+2gap. Each job starts later by (landing time -
 * its own run time).
 */
function planBatch(ns: NS, info: TargetInfo, id: number): Batch {
  const { host: target, sizes, homeCores } = info
  const weakenMs = ns.getWeakenTime(target)
  const planned: Batch['planned'] = []
  const job = (
    script: string,
    threads: number,
    runMs: number,
    landsAt: number,
  ): RunParams => {
    planned.push({ runMs, landsAt })

    return {
      script,
      threads,
      args: [target, landsAt - runMs, id],
      // Sized for home's cores, so only home gives them their full effect.
      host: homeCores > 1 && script !== 'workers/hack.js' ? 'home' : undefined,
    }
  }

  const jobs = [
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
  ]

  return { sizes, jobs, planned, durationMs: weakenMs + 2 * GAP_MS }
}
