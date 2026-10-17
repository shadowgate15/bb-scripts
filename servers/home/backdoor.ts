import { entry } from '@/lib/entry'
import { rootAll } from '@/lib/network/client'

/** Servers whose backdoor unlocks a faction invite. */
const FACTION_SERVERS = ['CSEC', 'avmnite-02h', 'I.I.I.I', 'run4theh111z']

/**
 * Prints the terminal command that backdoors each server, ready to paste.
 * Pass hostnames to pick the servers, or none for the faction servers.
 *
 * Scripts can only install a backdoor through Singularity, so this does the
 * finding instead: it roots what it can, skips what is already backdoored, and
 * works out the `connect` chain from home.
 */
export const main = entry(async (ns) => {
  const wanted = ns.args.length > 0 ? ns.args.map(String) : FACTION_SERVERS
  const rooted = new Set(await rootAll())

  for (const host of wanted) {
    if (!ns.serverExists(host)) {
      ns.tprint(`${host}: no such server`)
      continue
    }

    if (!rooted.has(host)) {
      ns.tprint(
        `${host}: no root yet (needs hacking ${ns.getServerRequiredHackingLevel(host)}, you have ${ns.getHackingLevel()})`,
      )
      continue
    }

    if (ns.getServer(host).backdoorInstalled) {
      ns.tprint(`${host}: already backdoored`)
      continue
    }

    const path = pathTo(ns, host)

    if (path === null) {
      ns.tprint(`${host}: no path from home`)
      continue
    }

    const hops = path.slice(1).map((hop) => `connect ${hop}`)

    ns.tprint(`${host}: ${['home', ...hops, 'backdoor'].join('; ')}`)
  }
})

/** Hostnames from home to `target`, inclusive, or null if unreachable. */
function pathTo(ns: NS, target: string): string[] | null {
  const parent = new Map<string, string>()
  const queue = ['home']

  for (const server of queue) {
    if (server === target) {
      const path = [server]

      for (let at = server; parent.has(at); ) {
        at = parent.get(at) as string
        path.unshift(at)
      }

      return path
    }

    for (const neighbor of ns.scan(server)) {
      if (neighbor !== 'home' && !parent.has(neighbor)) {
        parent.set(neighbor, server)
        queue.push(neighbor)
      }
    }
  }

  return null
}
