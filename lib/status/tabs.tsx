import { carbonfox as c } from '@/lib/status/theme'

export const TABS = ['overview', 'purchaser', 'pool'] as const
export type Tab = (typeof TABS)[number]

let current = 0
let listening = false

export const tabIndex = () => current

const go = (to: number) => {
  current = (to + TABS.length) % TABS.length
}

/** Arrow keys flip tabs; the status loop wakes early when `tabIndex()` changes. */
export function installTabKeys() {
  if (listening) return
  listening = true
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(current - 1)
    if (e.key === 'ArrowRight') go(current + 1)
  })
}

export const currentTab = (): Tab => TABS[current]

export function TabBar() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {TABS.map((t, i) => (
        <button
          key={t}
          type="button"
          onClick={() => go(i)}
          style={{
            flex: 1,
            cursor: 'pointer',
            font: 'inherit',
            textTransform: 'uppercase',
            fontSize: 11,
            padding: '4px 0',
            border: 'none',
            borderRadius: 4,
            color: i === current ? c.bg0 : c.comment,
            background: i === current ? c.blue : c.bg2,
            fontWeight: 'bold',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
