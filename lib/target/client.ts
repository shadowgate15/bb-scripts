import { createClient } from '../port-rpc/client'
import { type TargetRpc, targetChannel } from './protocol'

const client = () => createClient<TargetRpc>(targetChannel)

/** Hackable servers, best first. */
export function rankTargets(limit?: number) {
  return client().call('rank', { limit })
}

/**
 * The servers to hack at once, each planned for the RAM the earlier ones leave,
 * and the candidates that missed out.
 */
export function allocateTargets(limit: number, keep: string[]) {
  return client().call('lanes', { limit, keep })
}

export function getBestTarget() {
  return client().call('best', undefined)
}

/** Prep jobs for `host`, or null if it is already prepped. */
export function planTargetPrep(
  host: string,
  securitySlack: number,
  moneyFloor: number,
) {
  return client().call('prep', { host, securitySlack, moneyFloor })
}

/** Why servers were left out of the ranking. */
export function explainTargets() {
  return client().call('explain', undefined)
}
