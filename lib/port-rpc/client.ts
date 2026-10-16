import { getNs } from '@ns'
import type { Channel } from './channel'
import { claim } from './lease'
import { isResponse, type RpcRequest, type RpcSchema } from './protocol'

export interface CallOptions {
  /** Total time for the call, including waiting for a free reply port. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

/** Extra lease time past the deadline so a slow server can still reply. */
const LEASE_GRACE_MS = 1_000

export interface RpcClient<S extends RpcSchema> {
  call<M extends keyof S & string>(
    method: M,
    params: S[M]['params'],
    options?: CallOptions,
  ): Promise<S[M]['result']>
}

export function createClient<S extends RpcSchema>(
  channel: Channel,
): RpcClient<S> {
  return {
    async call(method, params, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      const ns = getNs()
      const id = crypto.randomUUID()
      const deadline = Date.now() + timeoutMs

      const lease = await claim(channel, id, deadline, LEASE_GRACE_MS)

      try {
        ns.getPortHandle(channel.requestPort).write({
          id,
          method,
          params,
          replyPort: lease.replyPort,
        } satisfies RpcRequest)

        while (true) {
          // Fetched each pass so a killed script throws here instead of reading
          // (and discarding) a response meant for the slot's next holder.
          const reply = ns.getPortHandle(lease.replyPort)

          while (!reply.empty()) {
            const msg = reply.read()

            if (!isResponse(msg) || msg.id !== id) {
              continue
            }

            if (!msg.ok) {
              throw new Error(`${method} failed: ${msg.error}`)
            }

            return msg.result as never
          }

          const remaining = deadline - Date.now()

          if (remaining <= 0) {
            throw new Error(`${method} timed out after ${timeoutMs}ms`)
          }

          await Promise.race([reply.nextWrite(), ns.asleep(remaining)])
        }
      } finally {
        lease.release()
      }
    },
  }
}
