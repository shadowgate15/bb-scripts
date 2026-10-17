/**
 * Pure stand-ins for `ns.format`. The status UI renders inside React, outside
 * the script's own control flow, where `ns` calls can trip the
 * one-pending-ns-call rule, so rendering must not call `ns`. These follow the
 * game's default Numeric Display settings, not the player's custom ones.
 */
const SUFFIXES = ['', 'k', 'm', 'b', 't', 'q', 'Q', 's', 'S', 'o', 'n']

function number(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : 'NaN'
  const abs = Math.abs(n)
  if (abs < 1000) return n.toFixed(abs === Math.trunc(abs) ? 0 : digits)
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(abs) / 3))
  return `${(n / 1000 ** tier).toFixed(digits)}${SUFFIXES[tier]}`
}

const RAM_UNITS = ['GB', 'TB', 'PB', 'EB']

function ram(gb: number, digits = 2): string {
  let tier = 0
  let value = gb
  while (Math.abs(value) >= 1024 && tier < RAM_UNITS.length - 1) {
    value /= 1024
    tier++
  }
  return `${value.toFixed(digits)}${RAM_UNITS[tier]}`
}

const percent = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`

function time(ms: number): string {
  if (!Number.isFinite(ms)) return '∞'
  let s = Math.max(0, Math.round(ms / 1000))
  const parts: string[] = []
  for (const [unit, size] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ] as const) {
    if (s >= size) {
      parts.push(`${Math.floor(s / size)}${unit}`)
      s %= size
    }
  }
  parts.push(`${s}s`)
  return parts.join(' ')
}

export const fmt = { number, ram, percent, time }
export type Fmt = typeof fmt
