/** Something the player buys by hand, which the purchaser must leave money for. */
export interface Reserve {
  item: string
  cost: number
}

const TOR: Reserve = { item: 'TOR router', cost: 200_000 }

/** Darkweb programs in the order they get affordable; each needs TOR first. */
const PROGRAMS: (Reserve & { file: string })[] = [
  { item: 'BruteSSH.exe', file: 'BruteSSH.exe', cost: 500_000 },
  { item: 'FTPCrack.exe', file: 'FTPCrack.exe', cost: 1_500_000 },
  { item: 'relaySMTP.exe', file: 'relaySMTP.exe', cost: 5_000_000 },
  { item: 'HTTPWorm.exe', file: 'HTTPWorm.exe', cost: 30_000_000 },
  { item: 'SQLInject.exe', file: 'SQLInject.exe', cost: 250_000_000 },
]

/**
 * The next TOR or darkweb purchase still missing, or null when all are owned.
 * Without Singularity the player buys these, so the purchaser spends only what
 * is left above this price and never starves them.
 */
export function nextReserve(
  hasTor: boolean,
  owns: (file: string) => boolean,
): Reserve | null {
  if (!hasTor) return TOR

  const missing = PROGRAMS.find((p) => !owns(p.file))

  return missing ? { item: missing.item, cost: missing.cost } : null
}
