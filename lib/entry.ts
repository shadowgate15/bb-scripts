import { setNs } from '@ns'

export function entry(fn: (ns: NS) => void | Promise<void>) {
  return async (_ns: NS) => {
    setNs(_ns)

    return fn(_ns)
  }
}
