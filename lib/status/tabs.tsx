import { carbonfox as c } from '@/lib/status/theme'

export const TABS = ['overview', 'purchaser', 'pool'] as const
export type Tab = (typeof TABS)[number]

/** Tab state, with ←/→ to flip between tabs. */
export function useTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = React.useState<Tab>('overview')

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      if (step === 0) return
      setTab((t) => TABS[(TABS.indexOf(t) + step + TABS.length) % TABS.length])
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return [tab, setTab]
}

export function TabBar({
  tab,
  onChange,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={{
            flex: 1,
            cursor: 'pointer',
            font: 'inherit',
            textTransform: 'uppercase',
            fontSize: 11,
            padding: '4px 0',
            border: 'none',
            borderRadius: 4,
            color: t === tab ? c.bg0 : c.comment,
            background: t === tab ? c.blue : c.bg2,
            fontWeight: 'bold',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
