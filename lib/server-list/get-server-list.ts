import { createClient } from '../port-rpc/client'
import { type ServerListRpc, serverListChannel } from './protocol'

/** Asks the server-list service for every known server name. */
export function getServerList(): Promise<string[]> {
  return createClient<ServerListRpc>(serverListChannel).call(
    'getServerList',
    undefined,
  )
}
