import { createClient } from '../port-rpc/client'
import { type RunnerRpc, type RunParams, runnerChannel } from './protocol'

/** Asks the runner to place `threads` of a script across free RAM. */
export function run(params: RunParams) {
  return createClient<RunnerRpc>(runnerChannel).call('run', params)
}
