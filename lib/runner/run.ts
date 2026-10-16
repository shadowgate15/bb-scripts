import { createClient } from '../port-rpc/client'
import { type RunnerRpc, type RunParams, runnerChannel } from './protocol'

/** Asks the runner to place `threads` of a script across free RAM. */
export function run(params: RunParams) {
  return createClient<RunnerRpc>(runnerChannel).call('run', params)
}

/** Starts every job in full, or none; `ok` is false if RAM didn't allow it. */
export function runAll(jobs: RunParams[]) {
  return createClient<RunnerRpc>(runnerChannel).call('runAll', { jobs })
}
