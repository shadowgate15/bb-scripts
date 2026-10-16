import { createClient } from '../port-rpc/client'
import { type RooterRpc, rooterChannel } from './protocol'

/** Asks the rooter to open what it can, and returns every rooted server. */
export function rootAll(): Promise<string[]> {
  return createClient<RooterRpc>(rooterChannel).call('rootAll', undefined)
}
