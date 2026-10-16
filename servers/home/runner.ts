import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { rootAll } from '@/lib/rooter/root-all'
import { type RunnerRpc, runnerChannel } from '@/lib/runner/protocol'

/** RAM kept free on home for the services themselves. */
const HOME_RESERVED_RAM = 32

/** Places script threads across the free RAM of every rooted server. */
export const main = entry(async (ns) => {
  await serve<RunnerRpc>(
    runnerChannel,
    {
      run: async ({ script, threads, args }) => {
        const ramPerThread = ns.getScriptRam(script, 'home')
        const pids: number[] = []
        let remaining = threads

        // Placement and exec happen with no await between them, so concurrent
        // calls can't both claim the same RAM.
        for (const host of await rootAll()) {
          if (remaining <= 0) break

          const reserved = host === 'home' ? HOME_RESERVED_RAM : 0
          const free =
            ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserved
          const fit = Math.min(remaining, Math.floor(free / ramPerThread))

          if (fit < 1) continue

          if (host !== 'home' && !ns.scp(script, host, 'home')) continue

          const pid = ns.exec(script, host, fit, ...args)

          if (pid === 0) continue

          pids.push(pid)
          remaining -= fit
        }

        return { launched: threads - remaining, pids }
      },
    },
    { onError: (e) => ns.print(`runner: ${e}`) },
  )
})
