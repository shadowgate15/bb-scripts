import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import {
  type ServerListRpc,
  serverListChannel,
} from '@/lib/server-list/protocol'

/** Serves the names of every server reachable from home, including home. */
export const main = entry(async (ns) => {
  await serve<ServerListRpc>(
    serverListChannel,
    { getServerList: () => scanNetwork(ns) },
    { onError: (e) => ns.print(`server-list: ${e}`) },
  )
})

/** Breadth-first walk of the network starting at home. */
function scanNetwork(ns: NS): string[] {
  const servers = ['home']
  const seen = new Set(servers)

  for (const server of servers) {
    for (const neighbor of ns.scan(server)) {
      if (!seen.has(neighbor)) {
        seen.add(neighbor)
        servers.push(neighbor)
      }
    }
  }

  return servers
}
