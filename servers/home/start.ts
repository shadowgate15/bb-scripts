import { HOME_RESERVED_RAM } from '@/lib/constants/ram'
import { entry } from '@/lib/entry'

const SERVICES = [
  'server-list.js',
  'rooter.js',
  'ram-pool.js',
  'runner.js',
  'target.js',
]

/**
 * Singularity calls cost 16x/4x/1x their base RAM by Source-File 4 level, so
 * home-upgrade is only worth starting once it fits well inside the services'
 * share of home RAM.
 */
const HOME_UPGRADE_MAX_RAM = HOME_RESERVED_RAM / 2

/** Starts every service, then the batcher and purchaser. Safe to re-run. */
export const main = entry(async (ns) => {
  const services = [...SERVICES]

  if (ns.getScriptRam('home-upgrade.js', 'home') <= HOME_UPGRADE_MAX_RAM) {
    services.push('home-upgrade.js')
  }

  for (const service of services) {
    if (!ns.isRunning(service, 'home')) {
      ns.run(service)
    }
  }

  await ns.sleep(500)

  for (const script of ['batcher.js', 'purchaser.js']) {
    if (!ns.isRunning(script, 'home')) {
      ns.run(script)
    }
  }
})
