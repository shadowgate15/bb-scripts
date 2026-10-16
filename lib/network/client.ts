import { createClient } from '../port-rpc/client'
import { type NetworkRpc, networkChannel } from './protocol'

const client = () => createClient<NetworkRpc>(networkChannel)

/** Asks the network service for every server reachable from home. */
export function getServers(): Promise<string[]> {
  return client().call('getServers', undefined)
}

/** Asks the network service to open what it can, and returns every rooted server. */
export function rootAll(): Promise<string[]> {
  return client().call('rootAll', undefined)
}
