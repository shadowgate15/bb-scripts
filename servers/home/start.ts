import { entry } from '@/lib/entry'

const SERVICES = [
  'server-list.js',
  'rooter.js',
  'ram-pool.js',
  'runner.js',
  'target.js',
]

/** Starts every service, then the batcher. Safe to re-run. */
export const main = entry(async (ns) => {
  for (const service of SERVICES) {
    if (!ns.isRunning(service, 'home')) {
      ns.run(service)
    }
  }

  await ns.sleep(500)

  if (!ns.isRunning('batcher.js', 'home')) {
    ns.run('batcher.js')
  }
})
