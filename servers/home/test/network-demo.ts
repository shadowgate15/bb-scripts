import { entry } from '@/lib/entry'
import { getServers } from '@/lib/network/client'

// Run `run network.js` first, then `run test/network-demo.js`.
export const main = entry(async (ns) => {
  ns.ui.openTail()

  const start = Date.now()
  const servers = await getServers()

  ns.print(`${servers.length} servers in ${Date.now() - start}ms`)

  for (const server of servers) {
    ns.print(`  ${server}`)
  }
})
