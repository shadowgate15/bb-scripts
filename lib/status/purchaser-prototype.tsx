/**
 * PROTOTYPE — the "next buy" purchaser panel for the status screen's
 * purchaser tab. Data is STUBBED (simulated from income) until the purchaser
 * publishes a real status. Called directly from Dashboard so `fmt`
 * (ns.format) runs before React renders.
 */
import { carbonfox as c } from '@/lib/status/theme'

type Fmt = NS['format']

export interface PurchaseStep {
  label: string
  cost: number
}

export interface PurchaserStub {
  budget: number
  cloudRams: number[]
  cloudLimit: number
  cloudMaxRam: number
  homeRam: number
  homeMaxRam: number
  homeCores: number
  queue: PurchaseStep[]
  history: { ago: number; label: string; cost: number }[]
}

/** Simulated purchaser state that advances with wall-clock time. */
const t0 = Date.now()
export function stubPurchaser(income: number): PurchaserStub {
  const elapsed = (Date.now() - t0) / 1000
  const cash = 2e8 + elapsed * Math.max(income, 5e5)
  const budget = cash * 0.5
  const rams = [64, 64, 128, 128, 256, 256, 512, 1024, 1024, 2048, 2048, 4096]
  const queue: PurchaseStep[] = [
    { label: 'upgrade cloud-3 → 512 GB', cost: 9.2e8 },
    { label: 'buy cloud-12 (128 GB)', cost: 1.4e9 },
    { label: 'home RAM → 2 TB', cost: 3.1e9 },
    { label: 'upgrade cloud-4 → 1 TB', cost: 3.6e9 },
    { label: 'home cores → 5', cost: 5.0e9 },
  ]
  return {
    budget,
    cloudRams: rams,
    cloudLimit: 25,
    cloudMaxRam: 1048576,
    homeRam: 1024,
    homeMaxRam: 1073741824,
    homeCores: 4,
    queue,
    history: [
      { ago: 41_000, label: 'upgrade cloud-11 → 4 TB', cost: 6.5e8 },
      { ago: 128_000, label: 'home cores → 4', cost: 4.1e8 },
      { ago: 305_000, label: 'buy cloud-11 (64 GB)', cost: 3.6e7 },
    ],
  }
}

const Box = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
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
      {title}
    </span>
    {children}
  </div>
)

const dim = { color: c.comment, fontSize: 12 } as const

/** A: one big bar toward the next purchase, with ETA and the last few buys. */
export function nextBuy(p: PurchaserStub, income: number, fmt: Fmt) {
  const next = p.queue[0]
  const share = Math.min(1, p.budget / next.cost)
  const missing = Math.max(0, next.cost - p.budget)
  // Only half of income is spendable, so the budget grows at half the rate.
  const etaMs = income > 0 ? (missing / (income * 0.5)) * 1000 : Infinity

  return (
    <Box title="purchaser · next buy">
      <div style={{ fontSize: 16, fontWeight: 'bold', color: c.blue }}>
        {next.label}
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
          ${fmt.number(p.budget, 2)} / ${fmt.number(next.cost, 2)}
        </span>
        <span style={{ color: share >= 1 ? c.green : c.teal }}>
          {share >= 1
            ? 'affordable now'
            : `${fmt.percent(share, 0)} · ~${fmt.time(etaMs)}`}
        </span>
      </div>
      <div style={dim}>recent</div>
      {p.history.map((h) => (
        <div
          key={h.label}
          style={{ ...dim, display: 'flex', justifyContent: 'space-between' }}
        >
          <span>
            {fmt.time(h.ago)} ago · {h.label}
          </span>
          <span>${fmt.number(h.cost, 1)}</span>
        </div>
      ))}
    </Box>
  )
}
