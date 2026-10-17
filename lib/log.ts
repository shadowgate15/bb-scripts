/** Appends one JSON line per event; see `createLog`. */
export type Log = (event: string, data?: Record<string, unknown>) => void

/** A file is rotated to `<name>.prev.txt` once it holds this many lines. */
const MAX_LINES = 20_000

/**
 * Logs events as JSON lines to `file` on home (the game only writes .txt, .json
 * and .css, so name it like `logs/batcher.jsonl.txt`). Each line is
 * `{"t": epoch ms, "event": ..., ...data}`. The previous run's file is kept as
 * `<name>.prev.txt`, and so is a full one, so a log never grows without bound.
 * Writing costs no RAM.
 */
export function createLog(ns: NS, file: string): Log {
  let lines = 0
  // The game only accepts a .txt name, so the suffix goes before the extension.
  const prev = file.replace(/\.txt$/, '.prev.txt')

  const rotate = () => {
    ns.write(prev, ns.read(file), 'w')
    ns.write(file, '', 'w')
    lines = 0
  }

  rotate()

  return (event, data = {}) => {
    if (lines >= MAX_LINES) rotate()

    ns.write(
      file,
      `${JSON.stringify({ t: Date.now(), event, ...data })}\n`,
      'a',
    )
    lines++
  }
}
