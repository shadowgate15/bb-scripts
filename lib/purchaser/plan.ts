/** Smallest cloud server worth buying, in GB. */
export const MIN_CLOUD_RAM = 8
/**
 * Home RAM counts as this many times better per dollar than cloud RAM: it
 * hosts the services and has no slot limit.
 */
export const HOME_PREFERENCE = 1.5

/**
 * Share of a home RAM upgrade's value that a core upgrade is judged against:
 * grow and weaken make up about this much of a pinned batch's RAM, and a core
 * makes each of their threads 1/(15 + cores) stronger on home.
 */
export const GROW_WEAKEN_SHARE = 0.7

export interface CloudServer {
  host: string
  ram: number
}

export interface PurchaseState {
  /** Most we're willing to spend on a single purchase. */
  budget: number
  servers: CloudServer[]
  serverLimit: number
  ramLimit: number
  cloudCost: (ram: number) => number
  upgradeCost: (host: string, ram: number) => number
  /** Null when home upgrades are unavailable. */
  home: {
    ram: number
    ramCost: number
    cores: number
    coreCost: number
  } | null
}

export type Purchase =
  | { kind: 'buy'; ram: number; cost: number }
  | { kind: 'upgrade'; host: string; ram: number; cost: number }
  | { kind: 'home'; cost: number }
  | { kind: 'cores'; cost: number }

interface Candidate {
  purchase: Purchase
  /** Dollars per GB gained, lower is better. */
  perGb: number
}

/** Largest power of two in [min, max] whose `cost` fits `budget`, or null. */
function largestAffordable(
  min: number,
  max: number,
  budget: number,
  cost: (ram: number) => number,
): number | null {
  let best: number | null = null

  for (let ram = min; ram <= max; ram *= 2) {
    const price = cost(ram)

    if (price >= 0 && price <= budget) best = ram
  }

  return best
}

/**
 * True when there is nothing left to buy: every cloud slot is filled with a
 * server at the RAM limit, and home RAM is unavailable or maxed out.
 *
 * A maxed home upgrade is assumed to quote an infinite cost; an unavailable one
 * (no home-upgrade service) counts as nothing to buy. Home is maxed when both
 * RAM and cores are.
 */
export function isDone(state: PurchaseState): boolean {
  const cloudMaxed =
    state.servers.length >= state.serverLimit &&
    state.servers.every((s) => s.ram >= state.ramLimit)
  const homeMaxed =
    state.home === null ||
    (!Number.isFinite(state.home.ramCost) &&
      !Number.isFinite(state.home.coreCost))

  return cloudMaxed && homeMaxed
}

/**
 * The single best purchase to make next, or null if nothing fits the budget.
 *
 * Cloud: fill every slot first, then double the smallest server as far as the
 * budget allows. Home RAM competes on dollars per GB, with a preference bonus.
 * A home core competes on the same scale, valued as the GB of home RAM it is
 * worth to grow and weaken (see GROW_WEAKEN_SHARE).
 */
export function nextPurchase(state: PurchaseState): Purchase | null {
  const candidates: Candidate[] = []

  if (state.servers.length < state.serverLimit) {
    const ram = largestAffordable(
      MIN_CLOUD_RAM,
      state.ramLimit,
      state.budget,
      state.cloudCost,
    )

    if (ram !== null) {
      const cost = state.cloudCost(ram)

      candidates.push({
        purchase: { kind: 'buy', ram, cost },
        perGb: cost / ram,
      })
    }
  } else {
    const smallest = state.servers.reduce<CloudServer | null>(
      (min, s) => (min === null || s.ram < min.ram ? s : min),
      null,
    )

    if (smallest !== null && smallest.ram < state.ramLimit) {
      const ram = largestAffordable(
        smallest.ram * 2,
        state.ramLimit,
        state.budget,
        (r) => state.upgradeCost(smallest.host, r),
      )

      if (ram !== null) {
        const cost = state.upgradeCost(smallest.host, ram)

        candidates.push({
          purchase: { kind: 'upgrade', host: smallest.host, ram, cost },
          perGb: cost / (ram - smallest.ram),
        })
      }
    }
  }

  if (state.home !== null && state.home.ramCost <= state.budget) {
    candidates.push({
      purchase: { kind: 'home', cost: state.home.ramCost },
      perGb: state.home.ramCost / state.home.ram / HOME_PREFERENCE,
    })
  }

  if (state.home !== null && state.home.coreCost <= state.budget) {
    const worthGb =
      (state.home.ram * GROW_WEAKEN_SHARE) / (15 + state.home.cores)

    candidates.push({
      purchase: { kind: 'cores', cost: state.home.coreCost },
      perGb: state.home.coreCost / worthGb / HOME_PREFERENCE,
    })
  }

  candidates.sort((a, b) => a.perGb - b.perGb)

  return candidates[0]?.purchase ?? null
}
