import { createClient } from '../port-rpc/client'
import { type RamPoolRpc, type ReserveParams, ramPoolChannel } from './protocol'

const client = () => createClient<RamPoolRpc>(ramPoolChannel)

export function reserveRam(params: ReserveParams) {
  return client().call('reserve', params)
}

export function releaseRam(id: string) {
  return client().call('release', { id })
}

export function getRamStatus() {
  return client().call('status', undefined)
}
