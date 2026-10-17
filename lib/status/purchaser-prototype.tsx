/**
 * PROTOTYPE — throwaway. Three variants of a "purchaser progress" section for
 * servers/home/status.tsx, switchable with the floating bar (or ←/→).
 * Data is STUBBED (simulated from income); nothing here reads or buys anything.
 * Variants are plain functions, called directly from Dashboard so `fmt` (ns.format)
 * runs before React renders.
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

const NAMES = ['A · next buy', 'B · fleet grid', 'C · roadmap']
let variant = 0
let listening = false

export const variantIndex = () => variant

/** Flip variants; the loop in status.tsx notices via `variantIndex()`. */
export function installSwitcherKeys() {
  if (listening) return
  listening = true
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return
    if (e.key === 'ArrowLeft') cycle(-1)
    if (e.key === 'ArrowRight') cycle(1)
  })
}

function cycle(by: number) {
  variant = (variant + by + NAMES.length) % NAMES.length
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

export function Prototype(p: PurchaserStub, income: number, fmt: Fmt) {
  const body =
    variant === 0
      ? variantA(p, income, fmt)
      : variant === 1
        ? variantB(p, fmt)
        : variantC(p, income, fmt)

  return (
    <>
      {body}
      <div
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          background: c.fg,
          color: c.bg0,
          borderRadius: 20,
          padding: '4px 14px',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          fontWeight: 'bold',
          boxShadow: '0 2px 10px #000a',
          zIndex: 9999,
        }}
      >
        <button
          type="button"
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            font: 'inherit',
          }}
          onClick={() => cycle(-1)}
        >
          ◀
        </button>
        <span>{NAMES[variant]}</span>
        <button
          type="button"
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            font: 'inherit',
          }}
          onClick={() => cycle(1)}
        >
          ▶
        </button>
      </div>
    </>
  )
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
function variantA(p: PurchaserStub, income: number, fmt: Fmt) {
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

/** B: the whole fleet as a grid of cells, brightness = how upgraded each is. */
function variantB(p: PurchaserStub, fmt: Fmt) {
  const slots = Array.from({ length: p.cloudLimit }, (_, i) => p.cloudRams[i])
  const level = (ram: number) => Math.log2(ram) / Math.log2(p.cloudMaxRam) // 0..1

  const homeRamLevel = Math.log2(p.homeRam) / Math.log2(p.homeMaxRam)

  return (
    <Box title="purchaser · fleet">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
        }}
      >
        {slots.map((ram, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: prototype
            key={i}
            style={{
              height: 34,
              borderRadius: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              border: ram ? 'none' : `1px dashed ${c.sel1}`,
              color: ram ? c.bg0 : c.sel1,
              background: ram
                ? `rgba(8,189,186,${0.25 + 0.75 * level(ram)})`
                : 'transparent',
            }}
          >
            {ram ? fmt.ram(ram) : 'empty'}
          </div>
        ))}
      </div>
      <div style={dim}>
        {p.cloudRams.length}/{p.cloudLimit} servers · max{' '}
        {fmt.ram(p.cloudMaxRam)} each
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={dim}>home RAM {fmt.ram(p.homeRam)}</div>
          <div style={{ background: c.bg0, height: 8, borderRadius: 3 }}>
            <div
              style={{
                width: `${homeRamLevel * 100}%`,
                height: 8,
                borderRadius: 3,
                background: c.magenta,
              }}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={dim}>home cores {p.homeCores}/8</div>
          <div style={{ background: c.bg0, height: 8, borderRadius: 3 }}>
            <div
              style={{
                width: `${(p.homeCores / 8) * 100}%`,
                height: 8,
                borderRadius: 3,
                background: c.pink,
              }}
            />
          </div>
        </div>
      </div>
    </Box>
  )
}

/** C: the planned purchase queue as a timeline, each step with a cumulative ETA. */
function variantC(p: PurchaserStub, income: number, fmt: Fmt) {
  let running = 0
  const rate = income * 0.5

  return (
    <Box title="purchaser · roadmap">
      <div style={dim}>
        budget ${fmt.number(p.budget, 2)} · spends 50% of income (≈ $
        {fmt.number(rate, 1)}/s)
      </div>
      {p.queue.map((s, i) => {
        running += s.cost
        const etaMs =
          rate > 0 ? Math.max(0, (running - p.budget) / rate) * 1000 : Infinity
        const ready = etaMs === 0
        return (
          <div
            key={s.label}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'baseline',
              opacity: 1 - i * 0.12,
            }}
          >
            <span style={{ color: ready ? c.green : c.sel1 }}>
              {ready ? '●' : '○'}
            </span>
            <span style={{ flex: 1, color: i === 0 ? c.blue : c.fg }}>
              {s.label}
            </span>
            <span style={dim}>${fmt.number(s.cost, 1)}</span>
            <span
              style={{ ...dim, width: 70, textAlign: 'right', color: c.teal }}
            >
              {ready ? 'now' : `+${fmt.time(etaMs)}`}
            </span>
          </div>
        )
      })}
    </Box>
  )
}
