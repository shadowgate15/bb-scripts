import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { releaseRam, reserveRam } from '@/lib/ram-pool/client'
import { type RunnerRpc, runnerChannel } from '@/lib/runner/protocol'

/** Execs script threads wherever the ram-pool says there is room. */
export const main = entry(async (ns) => {
  await serve<RunnerRpc>(
    runnerChannel,
    {
      run: async ({ script, threads, args }) => {
        const ramPerThread = ns.getScriptRam(script, 'home')
        const { id, placements } = await reserveRam({ ramPerThread, threads })
        const pids: number[] = []
        let launched = 0

        try {
          for (const { host, threads: fit } of placements) {
            if (host !== 'home' && !ns.scp(script, host, 'home')) continue

            const pid = ns.exec(script, host, fit, ...args)

            if (pid === 0) continue

            pids.push(pid)
            launched += fit
          }
        } finally {
          // Exec'd scripts now show as used RAM, so the hold is no longer needed.
          await releaseRam(id)
        }

        return { launched, pids }
      },
    },
    { onError: (e) => ns.print(`runner: ${e}`) },
  )
})
