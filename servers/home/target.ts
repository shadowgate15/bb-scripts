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

/** Ranks rooted servers worth hacking by max money per weaken-ms. */
export const main = entry(async (ns) => {
  const rank = async (): Promise<TargetInfo[]> => {
    const targets: TargetInfo[] = []

    for (const host of await rootAll()) {
      const maxMoney = ns.getServerMaxMoney(host)

      if (maxMoney <= 0) continue
      if (
        ns.getServerRequiredHackingLevel(host) >
        ns.getHackingLevel() * LEVEL_SHARE
      ) {
        continue
      }

      targets.push({
        host,
        maxMoney,
        minSecurity: ns.getServerMinSecurityLevel(host),
        score: maxMoney / ns.getWeakenTime(host),
      })
    }

    return targets.sort((a, b) => b.score - a.score)
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
