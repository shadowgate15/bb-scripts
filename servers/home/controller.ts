import { entry } from '@/lib/entry'
import { run } from '@/lib/runner/run'
import { getBestTarget } from '@/lib/target/client'

const SECURITY_SLACK = 1
const MONEY_FLOOR = 0.9
const HACK_FRACTION = 0.5
/** Extra wait past a script's finish time, in ms. */
const FINISH_BUFFER_MS = 200
const IDLE_MS = 5_000

/** Keeps one target at min security and max money, then hacks it. */
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

    const [script, threads, ms] = plan(ns, target)
    const { launched } = await run({ script, threads, args: [target] })

    ns.print(`${script} ${target}: ${launched}/${threads} threads`)
    await ns.sleep(launched > 0 ? ms + FINISH_BUFFER_MS : IDLE_MS)
  }
})

/** The next step for `target`: [worker script, threads, duration in ms]. */
function plan(ns: NS, target: string): [string, number, number] {
  const security = ns.getServerSecurityLevel(target)
  const minSecurity = ns.getServerMinSecurityLevel(target)

  if (security > minSecurity + SECURITY_SLACK) {
    const threads = Math.ceil((security - minSecurity) / 0.05)

    return ['workers/weaken.js', threads, ns.getWeakenTime(target)]
  }

  const money = ns.getServerMoneyAvailable(target)
  const maxMoney = ns.getServerMaxMoney(target)

  if (money < maxMoney * MONEY_FLOOR) {
    const threads = Math.ceil(
      ns.growthAnalyze(target, maxMoney / Math.max(money, 1)),
    )

    return ['workers/grow.js', threads, ns.getGrowTime(target)]
  }

  const threads = Math.max(
    1,
    Math.floor(ns.hackAnalyzeThreads(target, money * HACK_FRACTION)),
  )

  return ['workers/hack.js', threads, ns.getHackTime(target)]
}
