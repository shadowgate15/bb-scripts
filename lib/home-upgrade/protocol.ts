import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

/**
 * Shared by the home-upgrade client and server. Keep it free of client or
 * server code so importing it never drags either into the other's bundle.
 */
export interface HomeUpgradeRpc extends RpcSchema {
  /** Home's current max RAM and what doubling it costs. */
  quote: { params: undefined; result: { ram: number; ramCost: number } }
  /** Buys one home RAM upgrade. False if we can't afford it or it's maxed. */
  upgradeRam: { params: undefined; result: boolean }
}

export const homeUpgradeChannel = defineChannel(PORTS.HOME_UPGRADE)
