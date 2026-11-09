/**
 * Harness: what this project actually hands its agents.
 *
 * Skills, MCP servers and the lockfile already exist in a project as four
 * separate files in three directories. Nobody — including the person who wrote
 * them — can open a workspace and say in one look which skills are loaded,
 * which MCP servers are declared, and whether any of it is pinned. This panel
 * is that look.
 *
 * Deliberately not in the status bar: these values change with the project, not
 * with the second, and a bar that re-renders counters while you work is noise.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, ShieldX, Server } from 'lucide-react'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { joinPath } from '@/lib/path'
import { cn } from '@/lib/utils'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import { discoverSkillsForRuntimeTarget } from '@/runtime/skills/configuration/runtime-skills-client'
import { loadMcpConfigInspections } from '@/runtime/mcp/configuration/mcp-config-inspection'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import type { McpServerSummary } from '../../../../shared/mcp-config'
import {
  buildHarnessSkillRows,
  countGlobalSkills,
  countLockedSkills,
  parseSkillsLock,
  projectSkillRows,
  shortHash,
  SKILLS_LOCK_FILENAME,
  type HarnessSkillRow,
  type HarnessSkillStatus
} from './harness-lock'

type McpRow = McpServerSummary & { configLabel: string }

type HarnessData = {
  /** Every installed skill, project and global; the panel splits them for display. */
  skills: HarnessSkillRow[]
  mcp: McpRow[]
  hasLock: boolean
}

const EMPTY_DATA: HarnessData = { skills: [], mcp: [], hasLock: false }

const STATUS_ICON: Record<HarnessSkillStatus, typeof ShieldCheck> = {
  locked: ShieldCheck,
  unlocked: ShieldAlert,
  missing: ShieldX
}

const STATUS_CLASS: Record<HarnessSkillStatus, string> = {
  locked: 'text-emerald-500',
  unlocked: 'text-amber-500',
  missing: 'text-rose-500'
}

export default function HarnessPanel(): React.JSX.Element {
  const t = useTranslate()
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorktree = useAppStore((state) =>
    state.activeWorktreeId ? (state.getKnownWorktreeById(state.activeWorktreeId) ?? null) : null
  )
  const worktreePath = activeWorktree?.path ?? null

  const [data, setData] = useState<HarnessData>(EMPTY_DATA)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const fileContext = useMemo((): RuntimeFileOperationArgs | null => {
    if (!runtimeTarget || !worktreePath) {
      return null
    }
    return { target: runtimeTarget, worktreeId: activeWorktreeId, worktreePath }
  }, [activeWorktreeId, runtimeTarget, worktreePath])

  const load = useCallback(
    async (refresh: boolean) => {
      if (!runtimeTarget || !worktreePath || !fileContext) {
        setData(EMPTY_DATA)
        return
      }
      const generation = ++requestRef.current
      setLoading(true)
      setError(null)
      try {
        // Each source fails on its own terms; one unreadable file must not blank the panel.
        const [discovery, inspections, lockText] = await Promise.all([
          discoverSkillsForRuntimeTarget(runtimeTarget, {
            cwd: worktreePath,
            worktreeId: activeWorktreeId,
            ...(refresh ? { refresh: true } : {})
          }).catch(() => null),
          loadMcpConfigInspections(worktreePath, fileContext).catch(() => []),
          readRuntimeFileContent({
            target: runtimeTarget,
            worktreeId: activeWorktreeId ?? undefined,
            filePath: joinPath(worktreePath, SKILLS_LOCK_FILENAME),
            // Why both: a remote runtime resolves the read root-relative and ignores the absolute path.
            relativePath: SKILLS_LOCK_FILENAME
          })
            .then((result) => (result.isBinary ? null : result.content))
            .catch(() => null)
        ])
        if (generation !== requestRef.current) {
          return
        }
        const lock = parseSkillsLock(lockText)
        setData({
          skills: buildHarnessSkillRows(discovery?.skills ?? [], lock, worktreePath),
          mcp: inspections
            .filter((inspection) => inspection.exists)
            .flatMap((inspection) =>
              inspection.servers.map((server) => ({
                ...server,
                configLabel: inspection.candidate.relativePath
              }))
            ),
          hasLock: lock !== null
        })
        if (!discovery) {
          setError(t('koder.harness.skillsUnavailable', 'No se pudieron leer las skills.'))
        }
      } catch (caught) {
        if (generation === requestRef.current) {
          setError(extractIpcErrorMessage(caught, 'No se pudo leer el harness.'))
        }
      } finally {
        if (generation === requestRef.current) {
          setLoading(false)
        }
      }
    },
    [activeWorktreeId, fileContext, runtimeTarget, t, worktreePath]
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const projectSkills = useMemo(() => projectSkillRows(data.skills), [data.skills])
  const globalSkillCount = useMemo(() => countGlobalSkills(data.skills), [data.skills])
  const lockedCount = useMemo(() => countLockedSkills(projectSkills), [projectSkills])

  if (!worktreePath) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {t('koder.harness.noWorkspace', 'Selecciona un espacio de trabajo para ver su harness.')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {t('koder.harness.title', 'Harness')}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {t('koder.harness.counts', 'Skills {skills} · MCP {mcp} · Lock {lock}')
              .replace('{skills}', String(projectSkills.length))
              .replace('{mcp}', String(data.mcp.length))
              .replace('{lock}', data.hasLock ? `${lockedCount}/${projectSkills.length}` : '—')}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
          onClick={() => void load(true)}
          aria-label={t('koder.harness.refresh', 'Volver a leer')}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {error ? <p className="px-3 py-2 text-[11px] text-rose-400">{error}</p> : null}

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <Section
          label={t('koder.harness.skills', 'Skills del proyecto')}
          count={projectSkills.length}
        >
          {projectSkills.map((row) => {
            const Icon = STATUS_ICON[row.status]
            const hash = shortHash(row.hash)
            return (
              <div key={row.key} className="flex items-start gap-2 px-3 py-1.5">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', STATUS_CLASS[row.status])} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-foreground">{row.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {row.origin ?? '—'}
                    {hash ? ` · ${hash}` : ''}
                    {row.status === 'missing'
                      ? ` · ${t('koder.harness.absent', 'en lock, no instalada')}`
                      : row.status === 'unlocked'
                        ? ` · ${t('koder.harness.unpinned', 'sin lock')}`
                        : ''}
                  </p>
                </div>
              </div>
            )
          })}
        </Section>

        <Section label={t('koder.harness.mcp', 'MCP')} count={data.mcp.length}>
          {data.mcp.map((server) => (
            <div
              key={`${server.configLabel}:${server.name}`}
              className="flex items-start gap-2 px-3 py-1.5"
            >
              <Server
                className={cn(
                  'mt-0.5 size-3.5 shrink-0',
                  server.status === 'invalid'
                    ? 'text-rose-500'
                    : server.status === 'disabled'
                      ? 'text-muted-foreground'
                      : 'text-emerald-500'
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-foreground">{server.name}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {server.transport} · {server.url ?? server.command ?? server.configLabel}
                </p>
                {server.issue ? (
                  <p className="truncate text-[10px] text-rose-400">{server.issue}</p>
                ) : null}
              </div>
            </div>
          ))}
        </Section>
      </div>

      {/* The machine's own skills reach every project, so they are a footnote here, not a list. */}
      {globalSkillCount > 0 ? (
        <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
          {t('koder.harness.global', '+{count} skills globales de este equipo').replace(
            '{count}',
            String(globalSkillCount)
          )}
        </p>
      ) : null}

      {/* Why spelled out: "locked" here means declared in the lock, not re-hashed. */}
      <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground/70">
        {t('koder.harness.footnote', 'El lock se lee declarado; el hash todavía no se recalcula.')}
      </p>
    </div>
  )
}

function Section({
  label,
  count,
  children
}: {
  label: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="py-1">
      <p className="px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        {label} · {count}
      </p>
      {count === 0 ? <p className="px-3 py-1.5 text-[11px] text-muted-foreground">—</p> : children}
    </section>
  )
}
