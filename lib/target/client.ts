import { createClient } from '../port-rpc/client'
import { type TargetRpc, targetChannel } from './protocol'

const client = () => createClient<TargetRpc>(targetChannel)

/** Hackable servers, best first. */
export function rankTargets(limit?: number) {
  return client().call('rank', { limit })
}

export function getBestTarget() {
  return client().call('best', undefined)
}
