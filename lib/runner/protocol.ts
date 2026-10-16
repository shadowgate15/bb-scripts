import { PORTS } from '../constants/ports'
import { defineChannel, type RpcSchema } from '../port-rpc'

export type ScriptArg = string | number | boolean

export interface RunParams {
  /** Script on home, copied to each host it is placed on. */
  script: string
  /** Total threads wanted. The runner places as many as fit. */
  threads: number
  args: ScriptArg[]
  /** Run only on this host (e.g. home, for its cores); omit to place anywhere. */
  host?: string
}

/**
 * Shared by the runner client and server. Keep it free of client or server
 * code so importing it never drags either into the other's bundle.
 */
export interface RunnerRpc extends RpcSchema {
  /** Spreads `script` across rooted servers' free RAM. May place fewer than asked. */
  /**
   * All-or-nothing: starts every job in full, or none of them. Lets a caller
   * with timing-sensitive work (a batch) avoid launching half of it.
   */
  runAll: {
    params: { jobs: RunParams[] }
    result: { ok: boolean; pids: number[][] }
  }
  run: { params: RunParams; result: { launched: number; pids: number[] } }
}

export const runnerChannel = defineChannel(PORTS.RUNNER)
