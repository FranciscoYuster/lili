/**
 * Economy: what the work costs, next to the work.
 *
 * Orca scans four agents' logs, prices three of them, and attributes every turn
 * to a workspace — then shows the result in a stats page you open on purpose,
 * aggregated across everything. That aggregate is the number that misleads: six
 * projects' spend in one figure tells you nothing about the one you are billing.
 *
 * So this panel defaults to the active workspace and makes the other scope an
 * explicit click. The two readings are a factor of six apart and look identical
 * on screen; the only defence is that the header always says which one you are
 * reading.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/utils'
import { formatCostUsd, formatTokens } from '../canvas-tile-economy'
import { Kpi, Row, Section, Segment } from './economy-panel-parts'
import {
  cacheReuseRate,
  economyByAgent,
  economyByWorkspace,
  economyForWorktree,
  ECONOMY_AGENT_LABEL,
  readClaudeEconomyRows,
  readTotalShapedEconomyRows,
  sumEconomy,
  unattributedEconomy,
  type EconomyRow,
  type EconomyTotals
} from './economy-rows'

type PanelScope = 'workspace' | 'all'

const RANGES = ['7d', '30d', '90d', 'all'] as const
type PanelRange = (typeof RANGES)[number]

const RANGE_LABEL: Record<PanelRange, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  all: 'todo'
}

export default function EconomyPanel(): React.JSX.Element {
  const t = useTranslate()
  const [scope, setScope] = useState<PanelScope>('workspace')
  const [refreshing, setRefreshing] = useState(false)
  // Observed, not sniffed: "the first read finished" is what separates a panel
  // still loading from one whose host cannot answer at all.
  const [firstReadSettled, setFirstReadSettled] = useState(false)

  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorktree = useAppStore((state) =>
    state.activeWorktreeId ? (state.getKnownWorktreeById(state.activeWorktreeId) ?? null) : null
  )
  const setActiveWorktree = useAppStore((state) => state.setActiveWorktree)

  const claudeRows = useAppStore((state) => state.claudeUsageProjectBreakdown)
  const codexRows = useAppStore((state) => state.codexUsageProjectBreakdown)
  const openCodeRows = useAppStore((state) => state.openCodeUsageProjectBreakdown)
  const museRows = useAppStore((state) => state.museUsageProjectBreakdown)

  const range = useAppStore((state) => state.claudeUsageRange) as PanelRange
  const claudeEnabled = useAppStore((state) => state.claudeUsageScanState?.enabled ?? null)
  const codexEnabled = useAppStore((state) => state.codexUsageScanState?.enabled ?? null)
  const openCodeEnabled = useAppStore((state) => state.openCodeUsageScanState?.enabled ?? null)
  const museEnabled = useAppStore((state) => state.museUsageScanState?.enabled ?? null)

  const setClaudeRange = useAppStore((state) => state.setClaudeUsageRange)
  const setCodexRange = useAppStore((state) => state.setCodexUsageRange)
  const setOpenCodeRange = useAppStore((state) => state.setOpenCodeUsageRange)
  const setMuseRange = useAppStore((state) => state.setMuseUsageRange)

  const fetchClaude = useAppStore((state) => state.fetchClaudeUsage)
  const fetchCodex = useAppStore((state) => state.fetchCodexUsage)
  const fetchOpenCode = useAppStore((state) => state.fetchOpenCodeUsage)
  const fetchMuse = useAppStore((state) => state.fetchMuseUsage)

  const refreshClaude = useAppStore((state) => state.refreshClaudeUsage)
  const refreshCodex = useAppStore((state) => state.refreshCodexUsage)
  const refreshOpenCode = useAppStore((state) => state.refreshOpenCodeUsage)
  const refreshMuse = useAppStore((state) => state.refreshMuseUsage)

  const enableClaude = useAppStore((state) => state.enableClaudeUsage)
  const enableCodex = useAppStore((state) => state.enableCodexUsage)
  const enableOpenCode = useAppStore((state) => state.enableOpenCodeUsage)
  const enableMuse = useAppStore((state) => state.enableMuseUsage)

  const rows = useMemo<EconomyRow[]>(
    () => [
      ...readClaudeEconomyRows(claudeRows),
      ...readTotalShapedEconomyRows('codex', codexRows),
      ...readTotalShapedEconomyRows('opencode', openCodeRows),
      ...readTotalShapedEconomyRows('muse', museRows)
    ],
    [claudeRows, codexRows, openCodeRows, museRows]
  )

  const scopedRows = useMemo(
    () =>
      scope === 'workspace' && activeWorktreeId
        ? economyForWorktree(rows, activeWorktreeId)
        : rows.filter((row) => row.worktreeId !== null),
    [rows, scope, activeWorktreeId]
  )

  const totals = useMemo(() => sumEconomy(scopedRows), [scopedRows])
  const byAgent = useMemo(() => economyByAgent(scopedRows), [scopedRows])
  const byWorkspace = useMemo(() => economyByWorkspace(rows), [rows])
  const unplaced = useMemo(() => sumEconomy(unattributedEconomy(rows)), [rows])

  // All four scanners are opt-in and independent, so "off" means every one is
  // off: one enabled agent still gives a real, if partial, figure.
  const anyEnabled =
    claudeEnabled === true ||
    codexEnabled === true ||
    openCodeEnabled === true ||
    museEnabled === true
  const scanStateKnown =
    claudeEnabled !== null ||
    codexEnabled !== null ||
    openCodeEnabled !== null ||
    museEnabled !== null

  const changeRange = useCallback(
    (next: PanelRange) => {
      // Ranges are per provider but share one union; keeping them in step is what
      // makes the agent comparison below an apples-to-apples one.
      void setClaudeRange?.(next)
      void setCodexRange?.(next)
      void setOpenCodeRange?.(next)
      void setMuseRange?.(next)
    },
    [setClaudeRange, setCodexRange, setOpenCodeRange, setMuseRange]
  )

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshClaude?.(), refreshCodex?.(), refreshOpenCode?.(), refreshMuse?.()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshClaude, refreshCodex, refreshOpenCode, refreshMuse])

  // Why this has to exist: nothing else in the app loads usage for this panel.
  // Without it every provider's scanState stays null, the opt-in prompt below
  // never qualifies to render, and the dashboard shows a confident set of zeros
  // that look like a measured result rather than an unread one.
  useEffect(() => {
    let cancelled = false
    // Each fetch reads its own opt-in flag first and returns before scanning when
    // it is off, so calling all four unconditionally costs nothing when disabled.
    void Promise.allSettled([
      fetchClaude?.(),
      fetchCodex?.(),
      fetchOpenCode?.(),
      fetchMuse?.()
    ]).then(() => {
      if (!cancelled) {
        setFirstReadSettled(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [fetchClaude, fetchCodex, fetchOpenCode, fetchMuse])

  const enableAll = useCallback(() => {
    void enableClaude?.()
    void enableCodex?.()
    void enableOpenCode?.()
    void enableMuse?.()
  }, [enableClaude, enableCodex, enableOpenCode, enableMuse])

  // Zeros and "not read yet" are different claims, and only one of them is true
  // before the first fetch lands. Saying nothing beats saying US$0,00.
  if (!scanStateKnown && !firstReadSettled) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t('koder.economy.reading', 'Leyendo el consumo de los agentes…')}
      </div>
    )
  }

  // Every provider read came back empty. Upstream resolves these APIs to
  // undefined in a paired web client — the scanners walk the desktop's own
  // filesystem — so the honest answer is where to open this, not a spinner.
  if (!scanStateKnown) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t(
            'koder.economy.desktopOnly',
            'Este cliente no mide tokens. Los escáneres leen los registros locales de los agentes, así que la economía solo existe en la app de escritorio.'
          )}
        </p>
      </div>
    )
  }

  if (!anyEnabled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t(
            'koder.economy.offBody',
            'La medición de tokens está apagada. 信心 lee los registros locales de tus agentes; nada sale de tu máquina.'
          )}
        </p>
        <button
          type="button"
          className="rounded-md border border-border/70 bg-card px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:border-border"
          onClick={enableAll}
        >
          {t('koder.economy.enable', 'Medir tokens')}
        </button>
      </div>
    )
  }

  const scopeLabel =
    scope === 'workspace'
      ? (activeWorktree?.displayName ?? t('koder.economy.noWorkspace', 'sin espacio activo'))
      : t('koder.economy.allWorkspaces', 'todos los espacios')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {t('koder.economy.title', 'Economía')}
          </p>
          {/* The scope is in the subtitle, not a tooltip: it is the difference
              between one project's cost and the whole machine's. */}
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {`${scopeLabel} · ${RANGE_LABEL[range] ?? range}`}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
          onClick={() => void refreshAll()}
          aria-label={t('koder.economy.refresh', 'Volver a leer')}
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-1.5">
        <Segment
          active={scope === 'workspace'}
          onClick={() => setScope('workspace')}
          label={t('koder.economy.scopeWorkspace', 'Este espacio')}
        />
        <Segment
          active={scope === 'all'}
          onClick={() => setScope('all')}
          label={t('koder.economy.scopeAll', 'Todos')}
        />
        <span className="ml-auto flex items-center gap-1">
          {RANGES.map((value) => (
            <Segment
              key={value}
              active={range === value}
              onClick={() => changeRange(value)}
              label={RANGE_LABEL[value]}
            />
          ))}
        </span>
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Kpi
            label={t('koder.economy.spend', 'Gasto estimado')}
            value={
              totals.costUsd > 0 || !totals.hasUnpricedAgent
                ? `US$${formatCostUsd(totals.costUsd) ?? '0,00'}`
                : t('koder.economy.noPrice', 'sin tarifa')
            }
          />
          <Kpi label={t('koder.economy.tokens', 'Tokens')} value={formatTokens(totals.tokens)} />
          <Kpi
            label={t('koder.economy.cache', 'Reuso de caché')}
            value={formatRate(cacheReuseRate(totals))}
          />
          <Kpi label={t('koder.economy.sessions', 'Sesiones')} value={String(totals.sessions)} />
        </div>

        <Section label={t('koder.economy.byAgent', 'Por agente')} count={byAgent.length}>
          {byAgent.length === 0 ? (
            <p className="px-3 py-1.5 text-[11px] text-muted-foreground/60 italic">
              {t('koder.economy.noneHere', 'Sin consumo registrado en este alcance.')}
            </p>
          ) : (
            byAgent.map(({ agent, totals: agentTotals }) => (
              <Row
                key={agent}
                name={ECONOMY_AGENT_LABEL[agent]}
                detail={`${formatTokens(agentTotals.tokens)} tok · ${agentTotals.sessions} ses`}
                value={agentCost(agentTotals, t)}
              />
            ))
          )}
        </Section>

        {scope === 'all' ? (
          <Section label={t('koder.economy.byWorkspace', 'Por espacio')} count={byWorkspace.length}>
            {byWorkspace.map((entry) => (
              <Row
                key={entry.worktreeId}
                name={entry.label}
                detail={`${formatTokens(entry.totals.tokens)} tok`}
                value={agentCost(entry.totals, t)}
                onClick={() => setActiveWorktree?.(entry.worktreeId)}
                isActive={entry.worktreeId === activeWorktreeId}
              />
            ))}
          </Section>
        ) : (
          /* Why say this instead of showing a model split: the scanners publish
             per-model totals for the machine, not per workspace, so a split
             rendered here would be the global one wearing this project's name. */
          <p className="px-3 py-2 text-[11px] text-muted-foreground/70">
            {t(
              'koder.economy.noModelSplit',
              'El desglose por modelo existe solo a nivel global, no por espacio.'
            )}
          </p>
        )}
      </div>

      {unplaced.tokens > 0 ? (
        <p className="border-t border-border/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground/70">
          {t('koder.economy.unplaced', 'sin asignar: {tokens} tok').replace(
            '{tokens}',
            formatTokens(unplaced.tokens)
          )}
        </p>
      ) : null}

      {/* Why spelled out every time: these are published rates applied to logged
          tokens. A subscription bills none of it, and quoting it to a client as
          spend would be wrong. */}
      <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground/70">
        {totals.hasUnpricedAgent
          ? t(
              'koder.economy.footnoteUnpriced',
              'Costo equivalente estimado, no facturado. Algún agente reporta tokens sin tarifa: el monto es un piso.'
            )
          : t(
              'koder.economy.footnote',
              'Costo equivalente estimado con tarifas publicadas, no gasto facturado.'
            )}
      </p>
    </div>
  )
}

function agentCost(totals: EconomyTotals, t: ReturnType<typeof useTranslate>): string {
  if (totals.costUsd <= 0 && totals.hasUnpricedAgent) {
    return t('koder.economy.noPrice', 'sin tarifa')
  }
  return `US$${formatCostUsd(totals.costUsd) ?? '0,00'}`
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}
