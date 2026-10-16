import { entry } from '@/lib/entry'
import { prepStep, type Step } from '@/lib/prep'
import { run } from '@/lib/runner/run'
import { getBestTarget } from '@/lib/target/client'

const SECURITY_SLACK = 1
const MONEY_FLOOR = 0.9
const HACK_FRACTION = 0.5
/** Extra wait past a script's finish time, in ms. */
const FINISH_BUFFER_MS = 200
const IDLE_MS = 5_000

/** Simple fallback to the batcher: prep a target, then hack it in bulk. */
export const main = entry(async (ns) => {
  ns.ui.openTail()
  ns.disableLog('ALL')

  while (true) {
    const target = await getBestTarget()

    if (target === null) {
      ns.print('no hackable target yet')
      await ns.sleep(IDLE_MS)
      continue
    }

    const { script, threads, ms } =
      prepStep(target, SECURITY_SLACK, MONEY_FLOOR) ?? hackStep(ns, target)
    const { launched } = await run({ script, threads, args: [target] })

    ns.print(`${script} ${target}: ${launched}/${threads} threads`)
    await ns.sleep(launched > 0 ? ms + FINISH_BUFFER_MS : IDLE_MS)
  }
})

function hackStep(ns: NS, target: string): Step {
  const money = ns.getServerMoneyAvailable(target)
  const threads = Math.max(
    1,
    Math.floor(ns.hackAnalyzeThreads(target, money * HACK_FRACTION)),
  )

  return { script: 'workers/hack.js', threads, ms: ns.getHackTime(target) }
}
