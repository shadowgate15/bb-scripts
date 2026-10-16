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

/** Why servers were left out of the ranking. */
export function explainTargets() {
  return client().call('explain', undefined)
}
