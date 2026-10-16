import { entry } from '@/lib/entry'

const SERVICES = ['server-list.js', 'rooter.js', 'runner.js']

/** Starts every service, then the controller. Safe to re-run. */
export const main = entry(async (ns) => {
  for (const service of SERVICES) {
    if (!ns.isRunning(service, 'home')) {
      ns.run(service)
    }
  }

  await ns.sleep(500)

  if (!ns.isRunning('controller.js', 'home')) {
    ns.run('controller.js')
  }
})
