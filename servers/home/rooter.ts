import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { type RooterRpc, rooterChannel } from '@/lib/rooter/protocol'
import { getServerList } from '@/lib/server-list/get-server-list'

/**
 * How long a `rootAll` result is reused. Rooting only changes when your hacking
 * level, programs or network do, so a few seconds of staleness costs little and
 * saves a server-list round trip plus a scan on every call.
 */
const CACHE_TTL_MS = 5_000

/** Opens ports and nukes every server it can, on request. */
export const main = entry(async (ns) => {
  let cached: { servers: string[]; expires: number } | null = null
  let refresh: Promise<string[]> | null = null

  const rootEverything = async () => {
    const rooted: string[] = []

    for (const server of await getServerList()) {
      if (tryRoot(ns, server)) {
        rooted.push(server)
      }
    }

    return rooted
  }

  await serve<RooterRpc>(
    rooterChannel,
    {
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
    { onError: (e) => ns.print(`rooter: ${e}`) },
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
