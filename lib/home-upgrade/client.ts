import { createClient } from '../port-rpc/client'
import { type HomeUpgradeRpc, homeUpgradeChannel } from './protocol'

const client = () => createClient<HomeUpgradeRpc>(homeUpgradeChannel)

export function quoteHomeUpgrade() {
  return client().call('quote', undefined)
}

export function upgradeHomeRam() {
  return client().call('upgradeRam', undefined)
}
