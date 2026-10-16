/**
 * Describes a service: method name -> params and result types.
 *
 *   type ServerListRpc = {
 *     getServerList: { params: undefined; result: string[] }
 *   }
 */
export type RpcSchema = Record<string, { params: unknown; result: unknown }>

export interface RpcRequest {
  id: string
  method: string
  params: unknown
  replyPort: number
}

export type RpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }

export function isRequest(value: unknown): value is RpcRequest {
  if (typeof value !== 'object' || value === null) return false

  const req = value as RpcRequest

  return (
    typeof req.id === 'string' &&
    typeof req.method === 'string' &&
    typeof req.replyPort === 'number'
  )
}

export function isResponse(value: unknown): value is RpcResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RpcResponse).id === 'string' &&
    typeof (value as RpcResponse).ok === 'boolean'
  )
}
