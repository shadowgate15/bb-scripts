import { entry } from '@/lib/entry'
import { quoteHomeUpgrade, upgradeHomeRam } from '@/lib/home-upgrade/client'
import {
  nextPurchase,
  type Purchase,
  type PurchaseState,
} from '@/lib/purchaser/plan'

const CLOUD_PREFIX = 'cloud-'
/** Share of current cash a single purchase may use. */
const SPEND_FRACTION = 0.5
const TICK_MS = 10_000

/**
 * Spends money on RAM: cloud servers first (fill the slots, then upgrade the
 * smallest), and home RAM when it is cheap enough per GB. Home upgrades need
 * the optional home-upgrade service and are skipped without it.
 */
export const main = entry(async (ns) => {
  ns.disableLog('sleep')

  while (true) {
    // Several purchases per tick when cash allows; each re-reads fresh state.
    while (true) {
      const purchase = nextPurchase(await readState(ns))

      if (purchase === null || !(await execute(ns, purchase))) break
    }

    await ns.sleep(TICK_MS)
  }
})

async function readState(ns: NS): Promise<PurchaseState> {
  const home = ns.isRunning('home-upgrade.js', 'home')
    ? await quoteHomeUpgrade().catch(() => null)
    : null

  return {
    budget: ns.getPlayer().money * SPEND_FRACTION,
    servers: ns.cloud
      .getServerNames()
      .map((host) => ({ host, ram: ns.getServerMaxRam(host) })),
    serverLimit: ns.cloud.getServerLimit(),
    ramLimit: ns.cloud.getRamLimit(),
    cloudCost: (ram) => ns.cloud.getServerCost(ram),
    upgradeCost: (host, ram) => ns.cloud.getServerUpgradeCost(host, ram),
    home,
  }
}

/** Returns whether the purchase went through. */
async function execute(ns: NS, purchase: Purchase): Promise<boolean> {
  switch (purchase.kind) {
    case 'buy': {
      const host = ns.cloud.purchaseServer(freeName(ns), purchase.ram)

      ns.print(
        host === ''
          ? 'cloud server purchase failed'
          : `bought ${host} (${ns.format.ram(purchase.ram)})`,
      )

      return host !== ''
    }
    case 'upgrade': {
      const ok = ns.cloud.upgradeServer(purchase.host, purchase.ram)

      ns.print(
        `${ok ? 'upgraded' : 'failed to upgrade'} ${purchase.host} to ${ns.format.ram(purchase.ram)}`,
      )

      return ok
    }
    case 'home': {
      const ok = await upgradeHomeRam()

      ns.print(`home RAM upgrade ${ok ? 'bought' : 'failed'}`)

      return ok
    }
  }
}

/** First `cloud-N` name not already taken. */
function freeName(ns: NS): string {
  const taken = new Set(ns.cloud.getServerNames())

  for (let n = 0; ; n++) {
    if (!taken.has(`${CLOUD_PREFIX}${n}`)) return `${CLOUD_PREFIX}${n}`
  }
}
