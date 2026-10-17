import { entry } from '@/lib/entry'
import {
  buyHomeCores,
  buyHomeRam,
  quoteHomeUpgrade,
} from '@/lib/home-upgrade/client'
import { getServers } from '@/lib/network/client'
import {
  isDone,
  nextPurchase,
  nextTarget,
  type Purchase,
  type PurchaseState,
  SPEND_FRACTION,
} from '@/lib/purchaser/plan'
import {
  PURCHASER_STATUS_PORT,
  type PurchaserStatus,
} from '@/lib/status/protocol'

const CLOUD_PREFIX = 'cloud-'
const TICK_MS = 10_000
const RECENT_KEPT = 3

/** Our purchased servers, from the network service's scan. */
async function cloudServers(): Promise<string[]> {
  return (await getServers()).filter((host) => host.startsWith(CLOUD_PREFIX))
}

/**
 * Spends money on RAM: cloud servers first (fill the slots, then upgrade the
 * smallest), and home RAM when it is cheap enough per GB. Home upgrades need
 * the optional home-upgrade service and are skipped without it.
 */
export const main = entry(async (ns) => {
  ns.disableLog('sleep')

  const recent: PurchaserStatus['recent'] = []

  while (true) {
    let state = await readState(ns)

    // Several purchases per tick when cash allows; each re-reads fresh state.
    while (true) {
      const purchase = nextPurchase(state)

      if (purchase === null || !(await execute(ns, purchase))) break

      recent.unshift({ at: Date.now(), purchase })
      recent.length = Math.min(recent.length, RECENT_KEPT)
      state = await readState(ns)
    }

    const done = isDone(state)

    publish(ns, state, done, recent)

    // Free our RAM once there's nothing left to buy.
    if (done) {
      ns.print('everything is purchased; exiting')

      return
    }

    await ns.sleep(TICK_MS)
  }
})

/** Keeps the latest snapshot on the status port (clear + write). */
function publish(
  ns: NS,
  state: PurchaseState,
  done: boolean,
  recent: PurchaserStatus['recent'],
) {
  const status: PurchaserStatus = {
    updatedAt: Date.now(),
    done,
    next: nextTarget(state),
    cloudRams: state.servers.map((s) => s.ram),
    cloudLimit: state.serverLimit,
    cloudRamLimit: state.ramLimit,
    home: state.home && { ram: state.home.ram, cores: state.home.cores },
    recent: [...recent],
  }
  const port = ns.getPortHandle(PURCHASER_STATUS_PORT)

  port.clear()
  port.write(status)
}

async function readState(ns: NS): Promise<PurchaseState> {
  const home = ns.isRunning('home-upgrade.js', 'home')
    ? await quoteHomeUpgrade().catch(() => null)
    : null

  return {
    budget: ns.getServerMoneyAvailable('home') * SPEND_FRACTION,
    servers: (await cloudServers()).map((host) => ({
      host,
      ram: ns.getServerMaxRam(host),
    })),
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
      const host = ns.cloud.purchaseServer(
        freeName(await cloudServers()),
        purchase.ram,
      )

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
    case 'cores': {
      const ok = await buyHomeCores()

      ns.print(`home core upgrade ${ok ? 'bought' : 'failed'}`)

      return ok
    }
    case 'home': {
      const ok = await buyHomeRam()

      ns.print(`home RAM upgrade ${ok ? 'bought' : 'failed'}`)

      return ok
    }
  }
}

/** First `cloud-N` name not already taken. */
function freeName(names: string[]): string {
  const taken = new Set(names)

  for (let n = 0; ; n++) {
    if (!taken.has(`${CLOUD_PREFIX}${n}`)) return `${CLOUD_PREFIX}${n}`
  }
}
