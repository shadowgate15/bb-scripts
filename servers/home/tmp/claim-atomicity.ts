import { entry } from '@/lib/entry'

// In-game proof that a synchronous `empty()` check followed by `write()` is
// atomic across concurrently running scripts, and that arbitrary port numbers
// work.
//
// Run: `run tmp/claim-atomicity.js`
//
// The launcher spawns WORKERS copies of this script that all try to claim the
// same port. Every successful claim writes a marker, so the number of markers
// left on the port is the number of "winners".
//
//   - atomic: check + write with no await between them. Expect exactly 1 winner.
//   - racy:   same, but yields between check and write. This is the control:
//             it must produce more than 1 winner, otherwise the test setup
//             isn't actually creating contention and the atomic result means
//             nothing.

const CLAIM_PORT = 9_000_001
const WORKERS = 20

type Mode = 'atomic' | 'racy'

export const main = entry(async (ns) => {
  const [mode, workerId] = ns.args as [Mode?, number?]

  if (mode === undefined) {
    await launcher(ns)
  } else {
    await worker(ns, mode, workerId ?? 0)
  }
})

async function worker(ns: NS, mode: Mode, workerId: number) {
  const port = ns.getPortHandle(CLAIM_PORT)

  if (!port.empty()) {
    return
  }

  if (mode === 'racy') {
    await ns.sleep(0)
  }

  port.write({ owner: workerId })
}

async function launcher(ns: NS) {
  ns.ui.openTail()
  ns.disableLog('ALL')

  const port = ns.getPortHandle(CLAIM_PORT)
  const results: Record<Mode, number> = { atomic: 0, racy: 0 }

  for (const mode of ['atomic', 'racy'] as const) {
    port.clear()

    const pids = []
    for (let i = 0; i < WORKERS; i++) {
      const pid = ns.run(ns.getScriptName(), 1, mode, i)

      if (pid === 0) {
        throw new Error(`failed to spawn worker ${i} (not enough RAM?)`)
      }

      pids.push(pid)
    }

    while (pids.some((pid) => ns.isRunning(pid))) {
      await ns.sleep(50)
    }

    let winners = 0
    while (!port.empty()) {
      port.read()
      winners++
    }

    results[mode] = winners
    ns.print(`${mode}: ${winners} winner(s) out of ${WORKERS} workers`)
  }

  const atomicOk = results.atomic === 1
  const controlOk = results.racy > 1

  ns.print(`atomic claims exactly once: ${atomicOk ? 'PASS' : 'FAIL'}`)
  ns.print(`control shows contention:   ${controlOk ? 'PASS' : 'FAIL'}`)
  ns.print(
    atomicOk && controlOk
      ? 'PROVEN: check+write with no await is atomic'
      : 'NOT PROVEN: see results above',
  )
}
