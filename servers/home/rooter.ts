import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { type RooterRpc, rooterChannel } from '@/lib/rooter/protocol'
import { getServerList } from '@/lib/server-list/get-server-list'

/** Opens ports and nukes every server it can, on request. */
export const main = entry(async (ns) => {
  await serve<RooterRpc>(
    rooterChannel,
    {
      rootAll: async () => {
        const rooted: string[] = []

        for (const server of await getServerList()) {
          if (tryRoot(ns, server)) {
            rooted.push(server)
          }
        }

        return rooted
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
