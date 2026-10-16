import { entry } from '@/lib/entry'
import { rootAll } from '@/lib/rooter/root-all'
import { run } from '@/lib/runner/run'

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
    const target = await pickTarget(ns)

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

/** Best money per weaken-second among servers we can hack at half our level. */
async function pickTarget(ns: NS): Promise<string | null> {
  let best: string | null = null
  let bestScore = 0

  for (const host of await rootAll()) {
    const maxMoney = ns.getServerMaxMoney(host)

    if (maxMoney <= 0) continue
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel() / 2) {
      continue
    }

    const score = maxMoney / ns.getWeakenTime(host)

    if (score > bestScore) {
      best = host
      bestScore = score
    }
  }

  return best
}

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
