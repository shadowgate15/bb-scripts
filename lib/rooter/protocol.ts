import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

/**
 * Shared by the rooter client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface RooterRpc extends RpcSchema {
  /** Roots whatever it newly can, then returns every server we have root on. */
  rootAll: { params: undefined; result: string[] }
}

export const rooterChannel = defineChannel(PORTS.ROOTER)
