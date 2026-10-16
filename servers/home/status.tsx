import { entry } from '@/lib/entry'
import { rootAll } from '@/lib/rooter/root-all'
import {
  BATCHER_STATUS_PORT,
  type BatcherPhase,
  type BatcherStatus,
  isBatcherStatus,
} from '@/lib/status/protocol'
import { carbonfox as c } from '@/lib/status/theme'
import { rankTargets } from '@/lib/target/client'
import type { TargetInfo } from '@/lib/target/protocol'

const REFRESH_MS = 1_000
/**
 * Tail windows scroll to the bottom, so a window shorter than the dashboard
 * hides the top rows under its title bar. Raise TAIL_HEIGHT if rows get cut.
 */
const TAIL_WIDTH = 620
const TAIL_HEIGHT = 780
/** The candidate table is costlier to build, so it refreshes less often. */
const CANDIDATES_EVERY = 5
/** A snapshot this long past when it should have updated means the batcher is gone. */
const STALE_MS = 15_000

interface Pool {
  used: number
  max: number
  hosts: number
}

interface TargetLive {
  money: number
  maxMoney: number
  security: number
  minSecurity: number
}

interface View {
  status: BatcherStatus | null
  offline: boolean
  target: TargetLive | null
  pool: Pool | null
  income: number
  candidates: TargetInfo[] | null
  fmt: NS['format']
}

/** Live status of the hacking services, in a tail window. */
export const main = entry(async (ns) => {
  ns.ui.openTail()
  ns.ui.setTailTitle('hacking status')
  ns.ui.resizeTail(TAIL_WIDTH, TAIL_HEIGHT)
  ns.disableLog('ALL')

  let candidates: TargetInfo[] | null = null

  for (let tick = 0; ; tick++) {
    const status = readStatus(ns)

    if (tick % CANDIDATES_EVERY === 0) {
      candidates = await rankTargets(5).catch(() => null)
    }

    const view: View = {
      status,
      offline: status === null || Date.now() > staleAfter(status),
      target: status?.target ? readTarget(ns, status.target) : null,
      pool: await readPool(ns),
      income: ns.getTotalScriptIncome()[0],
      candidates,
      fmt: ns.format,
    }

    ns.clearLog()
    // Called as a function, not rendered as <Dashboard />: React renders later,
    // while this script is inside `ns.sleep`, and the `ns.format` calls in
    // Dashboard would then trip the one-pending-ns-call rule. Everything below
    // Dashboard only gets plain strings.
    ns.printRaw(Dashboard(view))
    await ns.sleep(REFRESH_MS)
  }
})

/** When this snapshot should have been refreshed by. A prep wait is expected to be long. */
function staleAfter(status: BatcherStatus): number {
  return (status.prepReadyAt ?? status.updatedAt) + STALE_MS
}

function readStatus(ns: NS): BatcherStatus | null {
  const value = ns.getPortHandle(BATCHER_STATUS_PORT).peek()

  return isBatcherStatus(value) ? value : null
}

function readTarget(ns: NS, host: string): TargetLive {
  return {
    money: ns.getServerMoneyAvailable(host),
    maxMoney: ns.getServerMaxMoney(host),
    security: ns.getServerSecurityLevel(host),
    minSecurity: ns.getServerMinSecurityLevel(host),
  }
}

async function readPool(ns: NS): Promise<Pool | null> {
  try {
    const hosts = await rootAll()

    return {
      hosts: hosts.length,
      used: hosts.reduce((sum, h) => sum + ns.getServerUsedRam(h), 0),
      max: hosts.reduce((sum, h) => sum + ns.getServerMaxRam(h), 0),
    }
  } catch {
    return null
  }
}

const PHASE: Record<BatcherPhase, { label: string; color: string }> = {
  searching: { label: 'SEARCHING', color: c.pink },
  prepping: { label: 'PREPPING', color: c.cyan },
  batching: { label: 'BATCHING', color: c.green },
  waiting: { label: 'POOL FULL', color: c.teal },
  retargeting: { label: 'SWITCHING', color: c.magenta },
}

const clamp01 = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0

function Dashboard({
  status,
  offline,
  target,
  pool,
  income,
  candidates,
  fmt,
}: View) {
  const phase = offline
    ? { label: 'OFFLINE', color: c.red }
    : PHASE[status?.phase ?? 'searching']

  return (
    <div
      style={{
        background: c.bg1,
        color: c.fg,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: c.blue, fontWeight: 'bold', fontSize: 15 }}>
          {status?.target ?? 'no target'}
        </span>
        <Pill label={phase.label} color={phase.color} />
      </div>

      <Panel>
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
        >
          <Stat
            label="income"
            value={`$${fmt.number(income, 2)}/s`}
            color={c.green}
          />
          <Stat
            label="expected"
            value={`$${fmt.number(status?.estIncomePerSec ?? 0, 2)}/s`}
            color={c.teal}
          />
          <Stat
            label="in flight"
            value={String(status?.inFlight ?? 0)}
            color={c.cyan}
          />
          <Stat
            label="launched"
            value={fmt.number(status?.batchesLaunched ?? 0, 1)}
            color={c.magenta}
          />
        </div>
      </Panel>

      {target && (
        <Panel title="target">
          <Bar
            label="money"
            value={target.money / target.maxMoney}
            color={c.green}
            right={`$${fmt.number(target.money, 2)} / $${fmt.number(target.maxMoney, 2)}`}
          />
          <Bar
            label="security"
            // Full bar means at the floor; empty means 3x or more above it.
            value={
              1 -
              (target.security - target.minSecurity) /
                (target.minSecurity * 2 || 1)
            }
            color={c.cyan}
            right={`${target.security.toFixed(2)} / min ${target.minSecurity.toFixed(2)}`}
          />
          {status?.phase === 'prepping' && status.prepReadyAt !== null && (
            <Dim>
              prep step lands in{' '}
              {fmt.time(Math.max(0, status.prepReadyAt - Date.now()))}
            </Dim>
          )}
        </Panel>
      )}

      {status?.phase === 'prepping' && status.prepThreads && (
        <Panel title="prep">
          <div style={{ display: 'flex', gap: 14 }}>
            <Stat
              label="weaken"
              value={fmt.number(status.prepThreads.weaken, 0)}
              color={c.blue}
              small
            />
            <Stat
              label="grow"
              value={fmt.number(status.prepThreads.grow, 0)}
              color={c.green}
              small
            />
          </div>
        </Panel>
      )}

      {status?.sizes && status.fraction !== null && (
        <Panel
          title={`batch · ${fmt.percent(status.fraction, 0)} of max money`}
        >
          <div style={{ display: 'flex', gap: 14 }}>
            <Stat
              label="hack"
              value={String(status.sizes.hack)}
              color={c.red}
              small
            />
            <Stat
              label="weaken"
              value={String(status.sizes.weakenAfterHack)}
              color={c.blue}
              small
            />
            <Stat
              label="grow"
              value={String(status.sizes.grow)}
              color={c.green}
              small
            />
            <Stat
              label="weaken"
              value={String(status.sizes.weakenAfterGrow)}
              color={c.blue}
              small
            />
          </div>
        </Panel>
      )}

      <Panel title={pool ? `pool · ${pool.hosts} servers` : 'pool'}>
        {pool ? (
          <Bar
            label="ram"
            value={pool.used / pool.max}
            color={pool.used / pool.max > 0.9 ? c.pink : c.teal}
            right={`${fmt.ram(pool.used)} / ${fmt.ram(pool.max)}`}
          />
        ) : (
          <Dim>rooter not responding</Dim>
        )}
      </Panel>

      <Panel title="candidates">
        {candidates === null ? (
          <Dim>target service not responding</Dim>
        ) : candidates.length === 0 ? (
          <Dim>nothing hackable yet</Dim>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: c.comment, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', fontWeight: 'normal' }}>
                  server
                </th>
                <th style={{ fontWeight: 'normal' }}>$/s</th>
                <th style={{ fontWeight: 'normal' }}>prep</th>
                <th style={{ fontWeight: 'normal' }}>hack</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((t) => (
                <tr
                  key={t.host}
                  style={{
                    textAlign: 'right',
                    color: t.host === status?.target ? c.blue : c.fg,
                  }}
                >
                  <td style={{ textAlign: 'left' }}>
                    {t.host === status?.target ? '● ' : ''}
                    {t.host}
                  </td>
                  <td>${fmt.number(t.incomePerSec, 1)}</td>
                  <td>{t.prepMs > 0 ? fmt.time(t.prepMs) : 'ready'}</td>
                  <td>{fmt.percent(t.fraction, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Dim>
        {offline ? 'no recent update from the batcher' : status?.message}
      </Dim>
    </div>
  )
}

function Panel({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
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
      {title && (
        <span
          style={{ color: c.comment, fontSize: 11, textTransform: 'uppercase' }}
        >
          {title}
        </span>
      )}
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  color,
  small,
}: {
  label: string
  value: string
  color: string
  small?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span
        style={{ color: c.comment, fontSize: 11, textTransform: 'uppercase' }}
      >
        {label}
      </span>
      <span style={{ color, fontSize: small ? 15 : 18, fontWeight: 'bold' }}>
        {value}
      </span>
    </div>
  )
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        color: c.bg0,
        background: color,
        borderRadius: 10,
        padding: '1px 10px',
        fontSize: 11,
        fontWeight: 'bold',
        alignSelf: 'center',
      }}
    >
      {label}
    </span>
  )
}

function Bar({
  label,
  value,
  color,
  right,
}: {
  label: string
  value: number
  color: string
  right: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
        }}
      >
        <span style={{ color: c.comment }}>{label}</span>
        <span>{right}</span>
      </div>
      <div style={{ background: c.bg0, borderRadius: 3, height: 8 }}>
        <div
          style={{
            background: color,
            borderRadius: 3,
            height: 8,
            width: `${clamp01(value) * 100}%`,
          }}
        />
      </div>
    </div>
  )
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: c.comment, fontSize: 12 }}>{children}</span>
}
