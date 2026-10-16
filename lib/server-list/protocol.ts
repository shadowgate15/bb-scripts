import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

/**
 * Shared by the server-list client and server. Keep it free of client or
 * server code so importing it never drags either into the other's bundle.
 */
export interface ServerListRpc extends RpcSchema {
  getServerList: { params: undefined; result: string[] }
}

export const serverListChannel = defineChannel(PORTS.SERVER_LIST)
