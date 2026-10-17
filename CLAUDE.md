# Repo purpose

This repository is for scripts for the game Bitburner v3.0.1.

## Bitburner Types

Types for the bitburner api are included at `./NetscriptDefinitions.d.ts`

## Repo Structure

/servers - Scripts that run on servers, they are bundled using esbuild when uploaded to Bitburner.
/lib - Libraries for use in scripts

## RAM

Every script's RAM cost is set by the `ns` functions its bundle references, and each server has limited RAM, so keep scripts as lean as possible.

- Split code by who runs it (e.g. client vs server) so a script's bundle only contains the `ns` calls it needs.
- Import from the specific module (`port-rpc/client`), not a barrel that re-exports both sides.
- Keep shared definitions (types, constants, channels) free of `ns` calls so both sides can import them for free.
- Check the cost of an `ns` function in `NetscriptDefinitions.d.ts` ("RAM cost") before adding it to shared code.

## Netscript gotchas

- **One pending async `ns` call per script.** While `ns.sleep`, `ns.hack`, etc. is pending, any other `ns` call (even `getPortHandle`) throws a concurrency error. Use `ns.asleep` for waits that overlap other work; it doesn't block.
- **Killed scripts' pending awaits still resume.** Port handle methods don't check whether the script is dead, but every `ns` call throws once it is. After any `await`, make an `ns` call (e.g. re-fetch the port handle) before touching ports, or a dead script can read or clear data meant for a live one. A killed server also stays in a port's `nextWrite` wait list until the game reloads, so reload the game after changing server code you've already run.
- **Tail logs keep only 50 lines.** Use `ns.disableLog('asleep')` etc. in debugging scripts rather than `disableLog('ALL')`, which can also hide runtime errors.
- **The game ships React 17.** Hooks like `useState`, `useEffect`, `useContext` work, but React 18 APIs (`useSyncExternalStore`, `useId`, `useTransition`, `useDeferredValue`, `useInsertionEffect`) don't exist and fail at render time, where esbuild and the types won't catch it. Feed the UI from the script with a store + context provider (`lib/status/context.tsx`) and keep render free of `ns` calls (use `lib/status/format.ts`, not `ns.format`).
- **Ports are shared across all scripts and reset only on game restart.** Port-rpc (`lib/port-rpc`) hands each service a disjoint port range keyed by its `PORTS` id; add new ids by appending to the enum, never reordering.
