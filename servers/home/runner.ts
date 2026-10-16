import { entry } from '@/lib/entry'
import { serve } from '@/lib/port-rpc/server'
import { releaseRam, reserveAllRam, reserveRam } from '@/lib/ram-pool/client'
import { type RunnerRpc, runnerChannel } from '@/lib/runner/protocol'

/** Execs script threads wherever the ram-pool says there is room. */
export const main = entry(async (ns) => {
  await serve<RunnerRpc>(
    runnerChannel,
    {
      runAll: async ({ jobs }) => {
        const reservation = await reserveAllRam({
          jobs: jobs.map((job) => ({
            ramPerThread: ns.getScriptRam(job.script, 'home'),
            threads: job.threads,
          })),
        })

        if (reservation === null) {
          return { ok: false, pids: [] }
        }

        const pids: number[][] = []

        try {
          for (const [i, job] of jobs.entries()) {
            const jobPids: number[] = []

            pids.push(jobPids)

            for (const { host, threads } of reservation.placements[i]) {
              if (host !== 'home' && !ns.scp(job.script, host, 'home')) {
                throw new Error(`scp ${job.script} to ${host} failed`)
              }

              const pid = ns.exec(job.script, host, threads, ...job.args)

              if (pid === 0) {
                throw new Error(`exec ${job.script} on ${host} failed`)
              }

              jobPids.push(pid)
            }
          }

          return { ok: true, pids }
        } catch (e) {
          // A partial batch would land out of order; stop what already started.
          for (const pid of pids.flat()) ns.kill(pid)

          ns.print(`runner: runAll aborted: ${e}`)

          return { ok: false, pids: [] }
        } finally {
          await releaseRam(reservation.id)
        }
      },

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
