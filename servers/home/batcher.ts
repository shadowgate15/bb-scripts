import { entry } from '@/lib/entry'
import { prepStep } from '@/lib/prep'
import type { RunParams } from '@/lib/runner/protocol'
import { run, runAll } from '@/lib/runner/run'
import { getBestTarget } from '@/lib/target/client'

/** Gap between the four landings of one batch, in ms. */
const GAP_MS = 50
/** A new batch starts this often; four gaps keeps landing windows apart. */
const SPACING_MS = GAP_MS * 4
/** Share of max money each batch steals. */
const HACK_FRACTION = 0.1
/** Tolerance when deciding the target is prepped enough to batch. */
const SECURITY_SLACK = 0.1
const MONEY_FLOOR = 0.98
/** Extra wait past a script's finish time, in ms. */
const FINISH_BUFFER_MS = 200
const IDLE_MS = 5_000

/**
 * Prepares the best target, then launches overlapping hack/weaken/grow/weaken
 * batches that land in that order, each GAP_MS apart. Whenever no batch is in
 * flight it re-checks the target, so drift gets corrected instead of compounding.
 */
export const main = entry(async (ns) => {
  ns.ui.openTail()
  ns.disableLog('ALL')

  let busyUntil = 0
  let batchId = 0

  while (true) {
    const target = await getBestTarget()

    if (target === null) {
      ns.print('no hackable target yet')
      await ns.sleep(IDLE_MS)
      continue
    }

    // Mid-flight readings are meaningless, so only inspect when nothing's running.
    if (Date.now() >= busyUntil) {
      const step = prepStep(target, SECURITY_SLACK, MONEY_FLOOR)

      if (step !== null) {
        const { launched } = await run({
          script: step.script,
          threads: step.threads,
          args: [target],
        })

        ns.print(`prep ${step.script} ${target}: ${launched}/${step.threads}`)
        await ns.sleep(launched > 0 ? step.ms + FINISH_BUFFER_MS : IDLE_MS)
        continue
      }
    }

    const batch = planBatch(ns, target, batchId)

    if (batch === null) {
      ns.print(`${target}: too little money to batch`)
      await ns.sleep(IDLE_MS)
      continue
    }

    const { ok } = await runAll(batch.jobs)

    if (ok) {
      batchId++
      busyUntil = Date.now() + batch.durationMs + FINISH_BUFFER_MS
    }

    await ns.sleep(SPACING_MS)
  }
})

interface Batch {
  jobs: RunParams[]
  /** From launch until the last job lands, in ms. */
  durationMs: number
}

/**
 * Sizes one hack/weaken/grow/weaken batch. Landing order, relative to the
 * weaken time W: hack at W-gap, weaken at W, grow at W+gap, weaken at W+2gap.
 * Each job starts later by (landing time - its own run time).
 */
function planBatch(ns: NS, target: string, id: number): Batch | null {
  const hackThreads = Math.floor(
    ns.hackAnalyzeThreads(target, ns.getServerMaxMoney(target) * HACK_FRACTION),
  )

  if (hackThreads < 1) return null

  const growThreads = Math.ceil(
    ns.growthAnalyze(target, 1 / (1 - HACK_FRACTION)),
  )
  const weakenPerThread = ns.weakenAnalyze(1)
  const weakenAfterHack = Math.ceil(
    ns.hackAnalyzeSecurity(hackThreads, target) / weakenPerThread,
  )
  const weakenAfterGrow = Math.ceil(
    ns.growthAnalyzeSecurity(growThreads, target) / weakenPerThread,
  )

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
    jobs: [
      job(
        'workers/hack.js',
        hackThreads,
        ns.getHackTime(target),
        weakenMs - GAP_MS,
      ),
      job('workers/weaken.js', weakenAfterHack, weakenMs, weakenMs),
      job(
        'workers/grow.js',
        growThreads,
        ns.getGrowTime(target),
        weakenMs + GAP_MS,
      ),
      job(
        'workers/weaken.js',
        weakenAfterGrow,
        weakenMs,
        weakenMs + 2 * GAP_MS,
      ),
    ],
    durationMs: weakenMs + 2 * GAP_MS,
  }
}
