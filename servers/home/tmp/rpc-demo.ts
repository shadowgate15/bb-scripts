import { PORTS } from '@/lib/constants/ports'
import { entry } from '@/lib/entry'
import { defineChannel, type RpcSchema } from '@/lib/port-rpc'
import { createClient } from '@/lib/port-rpc/client'
import { serve } from '@/lib/port-rpc/server'

// Run: `run tmp/rpc-demo.js`. Starts a server, then fires concurrent calls at
// it from the same script: a mix of success, handler error and unknown method.

interface DemoRpc extends RpcSchema {
  add: { params: { a: number; b: number }; result: number }
  fail: { params: undefined; result: never }
}

const channel = defineChannel(PORTS.SERVER_LIST, 4)

export const main = entry(async (ns) => {
  ns.ui.openTail()
  // The tail keeps only 50 lines; the claim loop's asleep logs would bury the results.
  ns.disableLog('asleep')
  ns.print('rpc-demo: starting')

  try {
    await run(ns)
    ns.print('rpc-demo: done')
  } catch (e) {
    // Surface failures in the tail instead of exiting silently.
    ns.print(`rpc-demo: FAILED: ${e instanceof Error ? e.stack : String(e)}`)
  }
})

async function run(ns: NS) {
  serve<DemoRpc>(
    channel,
    {
      add: async ({ a, b }) => {
        // asleep, not sleep: concurrent handlers can't each hold a pending ns.sleep.
        ns.print(`server: add(${a}, ${b})`)
        await ns.asleep(100)
        return a + b
      },
      fail: () => {
        throw new Error('boom')
      },
    },
    {
      onError: (e) =>
        ns.print(`server error: ${e instanceof Error ? e.stack : e}`),
    },
  ).catch((e) =>
    ns.print(`server crashed: ${e instanceof Error ? e.stack : e}`),
  )

  const client = createClient<DemoRpc>(channel)

  // 10 concurrent callers against a pool of 4 reply ports.
  const sums = await Promise.all(
    Array.from({ length: 10 }, (_, i) => client.call('add', { a: i, b: i })),
  )
  ns.print(`sums: ${sums.join(',')} (expect 0,2,4,...,18)`)

  await client.call('fail', undefined).catch((e: Error) => ns.print(e.message))
  await (
    client as never as { call: (m: string, p: unknown) => Promise<unknown> }
  )
    .call('nope', undefined)
    .catch((e: Error) => ns.print(e.message))
}
