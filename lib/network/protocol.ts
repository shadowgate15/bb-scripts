import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

/**
 * Shared by the network client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface NetworkRpc extends RpcSchema {
  /** Every server reachable from home, including home. Scanned fresh. */
  getServers: { params: undefined; result: string[] }
  /** Roots whatever it newly can, then returns every server we have root on. */
  rootAll: { params: undefined; result: string[] }
}

export const networkChannel = defineChannel(PORTS.NETWORK)
