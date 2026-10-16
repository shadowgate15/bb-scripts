import { entry } from '@/lib/entry'
import {
  type HomeUpgradeRpc,
  homeUpgradeChannel,
} from '@/lib/home-upgrade/protocol'
import { serve } from '@/lib/port-rpc/server'

/**
 * Wraps the Singularity home-upgrade calls. They need Source-File 4 and cost
 * 16x/4x/1x their base RAM by SF4 level, so they live in their own script
 * instead of inflating whoever decides when to buy.
 */
export const main = entry(async (ns) => {
  await serve<HomeUpgradeRpc>(
    homeUpgradeChannel,
    {
      quote: () => ({
        ram: ns.getServerMaxRam('home'),
        ramCost: ns.singularity.getUpgradeHomeRamCost(),
      }),
      upgradeRam: () => ns.singularity.upgradeHomeRam(),
    },
    { onError: (e) => ns.print(`home-upgrade: ${e}`) },
  )
})
