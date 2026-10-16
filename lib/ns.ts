import type { NS } from 'NetscriptDefinitions'

class NSWrapper {
  private ns: NS | null = null

  readonly getNs = (): NS => {
    if (this.ns === null) {
      throw new Error(
        'NS is not initialized. Please provide a valid NS object.',
      )
    }

    return this.ns
  }

  readonly setNs = (newNs: NS): void => {
    this.ns = newNs
  }
}

const ns = new NSWrapper()

export function getNs(): NS {
  return ns.getNs()
}

export function setNs(newNs: NS): void {
  // biome-ignore lint/correctness/noVoidTypeReturn: this guarantees pass thru if things change in the future
  return ns.setNs(newNs)
}
