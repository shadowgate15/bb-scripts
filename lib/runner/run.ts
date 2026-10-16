import { createClient } from '../port-rpc/client'
import { type RunnerRpc, type RunParams, runnerChannel } from './protocol'

/** Asks the runner to place `threads` of a script across free RAM. */
export function run(params: RunParams) {
  return createClient<RunnerRpc>(runnerChannel).call('run', params)
}

/** Kills processes the runner started, e.g. a batch found to be out of step. */
export function killPids(pids: number[]) {
  return createClient<RunnerRpc>(runnerChannel).call('kill', { pids })
}

/** Starts every job in full, or none; `ok` is false if RAM didn't allow it. */
export function runAll(jobs: RunParams[]) {
  return createClient<RunnerRpc>(runnerChannel).call('runAll', { jobs })
}
