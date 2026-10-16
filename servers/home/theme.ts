import carbonfox from '@/themes/carbonfox.json' with { type: 'json' }

/** Applies the carbonfox theme. Run with `reset` to restore the default. */
export function main(ns: NS) {
  if (ns.args[0] === 'reset') {
    ns.ui.resetTheme()
  } else {
    ns.ui.setTheme(carbonfox)
  }
}
