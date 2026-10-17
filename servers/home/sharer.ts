import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'
import { rootAll } from '@/lib/network/client'
import { getRamStatus } from '@/lib/ram-pool/client'
import type { RunParams } from '@/lib/runner/protocol'
import { runAll } from '@/lib/runner/run'
import {
  BATCHER_STATUS_PORT,
  type BatcherStatus,
  isBatcherStatus,
  SHARER_STATUS_PORT,
  type SharerStatus,
} from '@/lib/status/protocol'

const SCRIPT = 'workers/share.js'
const TICK_MS = 1_000
/** One ns.share() cycle, plus the time to start and finish it. */
const PULSE_MS = 10_500
/** The batcher refreshes its status every few hundred ms; older means it is gone. */
const STALE_MS = 5_000

/**
 * Puts the pool's excess RAM on ns.share(), which speeds up faction work. The
 * batcher publishes how much RAM its plans claim; everything past that is
 * excess. Shares in one-shot 10 s pulses that are topped up every tick, so a
 * bigger plan gets its RAM back within one cycle without anything to kill.
 * Holds off while any target is being prepped, since prep takes whatever fits.
 */
export const main = entry(async (ns) => {
  /** Share threads running, and when each pulse ends. */
  let pulses: { endsAt: number; threads: number }[] = []

  const publish = (threads: number, message: string) => {
    const port = ns.getPortHandle(SHARER_STATUS_PORT)
    const status: SharerStatus = {
      updatedAt: Date.now(),
      threads,
      power: ns.getSharePower(),
      message,
    }

    port.clear()
    port.write(status)
  }

  while (true) {
    const now = Date.now()

    pulses = pulses.filter((p) => p.endsAt > now)

    const running = pulses.reduce((sum, p) => sum + p.threads, 0)
    const batcher = readBatcher(ns)
    const hold = holdReason(batcher, now)

    if (hold !== null) {
      publish(running, hold)
      await ns.sleep(TICK_MS)
      continue
    }

    const ramPerThread = ns.getScriptRam(SCRIPT, 'home')
    const hosts = await rootAll()
    const usable = hosts.reduce(
      (sum, h) =>
        sum + ns.getServerMaxRam(h) - (h === 'home' ? HOME_RESERVED_RAM : 0),
      0,
    )
    // Plans pin grow and weaken to home's cores, so home's RAM is theirs.
    const pinned = (batcher as BatcherStatus).lanes.some(
      (l) => l.homeCores !== null && l.homeCores > 1,
    )
    let budget = Math.floor(
      (usable - (batcher as BatcherStatus).plannedRam) / ramPerThread - running,
    )
    const jobs: RunParams[] = []

    for (const { host, free } of await getRamStatus()) {
      if (budget < 1) break
      if (pinned && host === 'home') continue

      const threads = Math.min(budget, Math.floor(free / ramPerThread))

      if (threads < 1) continue

      jobs.push({ script: SCRIPT, threads, args: [], host })
      budget -= threads
    }

    if (jobs.length > 0 && (await runAll(jobs)).ok) {
      const threads = jobs.reduce((sum, j) => sum + j.threads, 0)

      pulses.push({ endsAt: Date.now() + PULSE_MS, threads })
      publish(running + threads, 'sharing excess RAM')
    } else {
      publish(running, running > 0 ? 'sharing excess RAM' : 'no excess RAM')
    }

    await ns.sleep(TICK_MS)
  }
})

function readBatcher(ns: NS): BatcherStatus | null {
  const value = ns.getPortHandle(BATCHER_STATUS_PORT).peek()

  return isBatcherStatus(value) ? value : null
}

/** Why sharing is off right now, or null if it is fine to share. */
function holdReason(batcher: BatcherStatus | null, now: number): string | null {
  if (batcher === null || now - batcher.updatedAt > STALE_MS) {
    return 'waiting for the batcher'
  }

  if (typeof batcher.plannedRam !== 'number' || batcher.lanes.length === 0) {
    return 'no targets yet'
  }

  if (batcher.lanes.some((l) => l.phase === 'prepping')) {
    return 'holding off while a target is prepped'
  }

  return null
}
