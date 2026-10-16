import { getNs } from '@ns'
import type { Channel } from './channel'
import { isRequest, type RpcResponse, type RpcSchema } from './protocol'

export type Handlers<S extends RpcSchema> = {
  [M in keyof S]: (
    params: S[M]['params'],
  ) => S[M]['result'] | Promise<S[M]['result']>
}

export interface ServeOptions {
  /**
   * Max requests handled at once. Defaults to the channel's pool size, which
   * is also the most calls clients can have in flight.
   */
  maxConcurrency?: number
  /**
   * Drop requests queued before this server started (default). Set false on
   * additional server scripts sharing an inbox so they don't wipe live requests.
   */
  clearInbox?: boolean
  /**
   * Called for problems the server can't report to a caller: a malformed
   * request, or a failure while sending a response. Defaults to console.error.
   */
  onError?: (error: unknown) => void
}

/**
 * Serves requests on `channel` forever, running handlers concurrently. Handlers
 * that `await` something overlap; synchronous work still runs one request at a
 * time.
 *
 * Bitburner allows only one pending async NS call per script, so concurrent
 * handlers must not each await `ns.sleep`/`ns.hack`/etc. (the second call
 * fails). Use `ns.asleep` (which doesn't block concurrent calls), other port-rpc calls,
 * or plain promises instead.
 * For parallel NS work, run several server scripts: they can share one inbox
 * because each `read()` removes a request for exactly one of them.
 *
 * Handlers should finish well inside the clients' timeout; a response that
 * arrives late is dropped by the client.
 *
 * Handler errors are sent back to the caller instead of crashing the server.
 */
export async function serve<S extends RpcSchema>(
  channel: Channel,
  handlers: Handlers<S>,
  {
    maxConcurrency = channel.poolSize,
    clearInbox = true,
    onError = (error) => console.error('[port-rpc]', error),
  }: ServeOptions = {},
): Promise<never> {
  const ns = getNs()
  const inFlight = new Set<Promise<void>>()

  // Drop requests queued for a previous server instance; their callers have
  // already timed out.
  if (clearInbox) {
    ns.getPortHandle(channel.requestPort).clear()
  }

  while (true) {
    // At capacity: leave requests queued on the port until a handler finishes.
    while (inFlight.size >= maxConcurrency) {
      await Promise.race(inFlight)
    }

    // Fetch the handle fresh each pass. A killed script's pending awaits still
    // resume (port handles don't check for that, but every `ns` call throws once
    // the script is dead), so without this a dead server wakes on the next write
    // and silently swallows requests meant for the live one.
    const inbox = ns.getPortHandle(channel.requestPort)

    if (inbox.empty()) {
      await inbox.nextWrite()
      continue
    }

    const req = inbox.read()

    if (!isRequest(req)) {
      onError(new Error(`malformed request: ${JSON.stringify(req)}`))
      continue
    }

    const task: Promise<void> = dispatch(
      handlers,
      req.id,
      req.method,
      req.params,
    )
      .then((response) => ns.getPortHandle(req.replyPort).write(response))
      .then(() => undefined)
      .catch(onError)
      .finally(() => inFlight.delete(task))

    inFlight.add(task)
  }
}

async function dispatch<S extends RpcSchema>(
  handlers: Handlers<S>,
  id: string,
  method: string,
  params: unknown,
): Promise<RpcResponse> {
  if (!Object.hasOwn(handlers, method)) {
    return { id, ok: false, error: `unknown method "${method}"` }
  }

  try {
    const result = await handlers[method](params as never)

    return { id, ok: true, result }
  } catch (err) {
    return {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
