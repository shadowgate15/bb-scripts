/**
 * Hands the script's latest snapshot to the React tree. The script writes to a
 * store; the provider mirrors it into state, so consumers re-render on each
 * snapshot. Plain state + effect, since the game's React may predate hooks
 * like `useSyncExternalStore`.
 */
import type { Store } from '@/lib/status/store'

export function createStatusContext<T>() {
  const Context = React.createContext<T | null>(null)

  function Provider({
    store,
    children,
  }: {
    store: Store<T | null>
    children: React.ReactNode
  }) {
    const [value, setValue] = React.useState<T | null>(store.get())

    React.useEffect(() => {
      setValue(store.get())
      return store.subscribe(() => setValue(store.get()))
    }, [store])

    return <Context.Provider value={value}>{children}</Context.Provider>
  }

  return { Provider, useValue: () => React.useContext(Context) }
}
