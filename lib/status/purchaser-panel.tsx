import type { Purchase } from '@/lib/purchaser/plan'
import { SPEND_FRACTION } from '@/lib/purchaser/plan'
import { fmt } from '@/lib/status/format'
import type { PurchaserStatus } from '@/lib/status/protocol'
import { carbonfox as c } from '@/lib/status/theme'

const dim = { color: c.comment, fontSize: 12 } as const

function describe(p: Purchase): string {
  switch (p.kind) {
    case 'buy':
      return `buy a cloud server (${fmt.ram(p.ram)})`
    case 'upgrade':
      return `upgrade ${p.host} to ${fmt.ram(p.ram)}`
    case 'home':
      return 'upgrade home RAM'
    case 'cores':
      return 'add a home core'
  }
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: c.bg2,
        border: `1px solid ${c.sel0}`,
        borderRadius: 6,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{ color: c.comment, fontSize: 11, textTransform: 'uppercase' }}
      >
        purchaser
      </span>
      {children}
    </div>
  )
}

/**
 * Progress toward the purchaser's next buy. `cash` and `income` are live;
 * the status only says what it is saving for.
 */
export function PurchaserPanel({
  status,
  cash,
  income,
  now,
}: {
  /** Null when the purchaser isn't running and never finished. */
  status: PurchaserStatus | null
  cash: number
  income: number
  now: number
}) {
  if (status === null) {
    return (
      <Box>
        <span style={dim}>purchaser is not running</span>
      </Box>
    )
  }

  const { next } = status
  const budget = cash * SPEND_FRACTION
  const share = next === null ? 0 : Math.min(1, budget / next.cost)
  const missing = next === null ? 0 : Math.max(0, next.cost - budget)
  // Only a share of income is spendable on one purchase, so the budget grows
  // at that share of the rate.
  const etaMs =
    income > 0 ? (missing / (income * SPEND_FRACTION)) * 1000 : Number.NaN

  return (
    <Box>
      {status.done || next === null ? (
        <span style={{ color: c.green, fontWeight: 'bold' }}>
          everything is purchased
        </span>
      ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: c.blue }}>
            {describe(next)}
          </div>
          <div style={{ background: c.bg0, borderRadius: 4, height: 18 }}>
            <div
              style={{
                width: `${share * 100}%`,
                height: 18,
                borderRadius: 4,
                background: share >= 1 ? c.green : c.cyan,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              ${fmt.number(budget, 2)} / ${fmt.number(next.cost, 2)}
            </span>
            <span style={{ color: share >= 1 ? c.green : c.teal }}>
              {share >= 1
                ? 'affordable now'
                : `${fmt.percent(share, 0)}${Number.isNaN(etaMs) ? '' : ` · ~${fmt.time(etaMs)}`}`}
            </span>
          </div>
        </>
      )}

      <div style={dim}>
        {status.cloudRams.length}/{status.cloudLimit} cloud servers
        {status.cloudRams.length > 0 &&
          ` · ${fmt.ram(Math.min(...status.cloudRams))} to ${fmt.ram(Math.max(...status.cloudRams))}`}
        {` (limit ${fmt.ram(status.cloudRamLimit)})`}
      </div>
      <div style={dim}>
        {status.home
          ? `home: ${fmt.ram(status.home.ram)} · ${status.home.cores} cores`
          : 'home upgrades unavailable (home-upgrade.js not running)'}
      </div>

      {status.recent.length > 0 && <span style={dim}>recent</span>}
      {status.recent.map((r) => (
        <div
          key={r.at}
          style={{ ...dim, display: 'flex', justifyContent: 'space-between' }}
        >
          <span>
            {fmt.time(now - r.at)} ago · {describe(r.purchase)}
          </span>
          <span>${fmt.number(r.purchase.cost, 1)}</span>
        </div>
      ))}
    </Box>
  )
}
