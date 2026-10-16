import { NS as _NS } from 'NetscriptDefinitions'
import type * as _React from 'react'

declare global {
  type NS = _NS
  // Bitburner exposes React as a global; JSX compiles to React.createElement.
  const React: typeof _React
}
