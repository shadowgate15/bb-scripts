import { entry } from '@/lib/entry'
import { getServerList } from '@/lib/server-list/get-server-list'

// Run `run server-list.js` first, then `run test/server-list-demo.js`.
export const main = entry(async (ns) => {
  ns.ui.openTail()

  const start = Date.now()
  const servers = await getServerList()

  ns.print(`${servers.length} servers in ${Date.now() - start}ms`)

  for (const server of servers) {
    ns.print(`  ${server}`)
  }
})
