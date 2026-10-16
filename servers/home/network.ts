import { entry } from '@/lib/entry'
import { type NetworkRpc, networkChannel } from '@/lib/network/protocol'
import { serve } from '@/lib/port-rpc/server'

/**
 * How long a `rootAll` result is reused. Rooting only changes when your hacking
 * level, programs or network do, so a few seconds of staleness costs little and
 * saves a scan plus a pass over every server on each call.
 */
const CACHE_TTL_MS = 5_000

/** Knows the network: lists every server, and opens ports and nukes what it can. */
export const main = entry(async (ns) => {
  let cached: { servers: string[]; expires: number } | null = null
  let refresh: Promise<string[]> | null = null

  const rootEverything = async () => {
    const rooted: string[] = []

    for (const server of scanNetwork(ns)) {
      if (tryRoot(ns, server)) {
        rooted.push(server)
      }
    }

    return rooted
  }

  await serve<NetworkRpc>(
    networkChannel,
    {
      getServers: () => scanNetwork(ns),

      rootAll: async () => {
        if (cached !== null && cached.expires > Date.now()) {
          return cached.servers
        }

        // Callers that arrive mid-refresh share it instead of starting another.
        refresh ??= rootEverything()
          .then((servers) => {
            cached = { servers, expires: Date.now() + CACHE_TTL_MS }

            return servers
          })
          .finally(() => {
            refresh = null
          })

        return refresh
      },
    },
    { onError: (e) => ns.print(`network: ${e}`) },
  )
})

/** Port-opening programs, in the order the game unlocks them. */
const OPENERS: [file: string, open: (ns: NS, host: string) => void][] = [
  ['BruteSSH.exe', (ns, host) => ns.brutessh(host)],
  ['FTPCrack.exe', (ns, host) => ns.ftpcrack(host)],
  ['relaySMTP.exe', (ns, host) => ns.relaysmtp(host)],
  ['HTTPWorm.exe', (ns, host) => ns.httpworm(host)],
  ['SQLInject.exe', (ns, host) => ns.sqlinject(host)],
]

/** Returns whether we have root on `host` afterwards. */
function tryRoot(ns: NS, host: string): boolean {
  if (ns.hasRootAccess(host)) {
    return true
  }

  if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) {
    return false
  }

  const available = OPENERS.filter(([file]) => ns.fileExists(file, 'home'))

  if (available.length < ns.getServerNumPortsRequired(host)) {
    return false
  }

  for (const [, open] of available) {
    open(ns, host)
  }

  ns.nuke(host)

  return ns.hasRootAccess(host)
}

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
