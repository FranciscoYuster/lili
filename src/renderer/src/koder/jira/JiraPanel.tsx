/**
 * Jira: this repository's board, with the workspace each issue lives in.
 *
 * The Tasks page already lists issues; what it cannot tell you from inside a
 * repo is which of them someone has already opened a workspace for. That join
 * exists in the attachment index and has never been rendered next to the code.
 *
 * Scoped to the repo's `defaultJiraProject` rather than the global selection on
 * purpose: a sidebar reading the whole account would answer a question nobody
 * asks while editing a file.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/utils'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import {
  buildJiraIssueWorkspaceAttachmentIndex,
  findJiraIssueWorkspaceAttachmentsInIndex
} from '@/lib/jira-issue-workspace-attachment'
import type { JiraIssue } from '../../../../shared/jira/jira-types'
import {
  buildProjectIssueRows,
  buildProjectIssuesJql,
  countLinkedRows,
  projectLabel,
  sortProjectIssueRows,
  type ProjectIssueRow
} from './project-issues'

const ISSUE_LIMIT = 50

export default function JiraPanel(): React.JSX.Element {
  const t = useTranslate()
  const worktrees = useAllWorktrees()
  const repos = useAppStore((state) => state.repos)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorktree = useAppStore((state) =>
    state.activeWorktreeId ? (state.getKnownWorktreeById(state.activeWorktreeId) ?? null) : null
  )
  const searchJiraIssues = useAppStore((state) => state.searchJiraIssues)
  const jiraStatus = useAppStore((state) => state.jiraStatus)

  const repo = useMemo(
    () => repos.find((entry) => entry.id === activeWorktree?.repoId) ?? null,
    [repos, activeWorktree?.repoId]
  )
  const project = repo?.defaultJiraProject ?? null
  const siteName = useMemo(
    () => jiraStatus.sites?.find((site) => site.id === project?.siteId)?.displayName ?? null,
    [jiraStatus.sites, project?.siteId]
  )

  const [issues, setIssues] = useState<readonly JiraIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force: boolean) => {
      if (!project) {
        setIssues([])
        return
      }
      const jql = buildProjectIssuesJql(project.key)
      if (!jql) {
        setError(
          t('koder.jira.badKey', 'La clave del proyecto Jira no es válida: {key}').replace(
            '{key}',
            project.key
          )
        )
        return
      }
      setLoading(true)
      setError(null)
      try {
        const found = await searchJiraIssues(jql, ISSUE_LIMIT, {
          siteId: project.siteId,
          ...(force ? { force: true } : {})
        })
        setIssues(found)
      } catch (caught) {
        setError(
          extractIpcErrorMessage(
            caught,
            t('koder.jira.loadFailed', 'No se pudieron leer las issues de este proyecto.')
          )
        )
      } finally {
        setLoading(false)
      }
    },
    [project, searchJiraIssues, t]
  )

  useEffect(() => {
    void load(false)
  }, [load])

  const attachmentIndex = useMemo(
    () => buildJiraIssueWorkspaceAttachmentIndex(worktrees),
    [worktrees]
  )
  const rows = useMemo(
    () =>
      sortProjectIssueRows(
        buildProjectIssueRows(
          issues,
          (issue) => findJiraIssueWorkspaceAttachmentsInIndex(attachmentIndex, issue),
          activeWorktreeId
        )
      ),
    [issues, attachmentIndex, activeWorktreeId]
  )

  if (!activeWorktree) {
    return (
      <Centered>
        {t('koder.jira.noWorkspace', 'Abre un espacio de trabajo para ver su proyecto de Jira.')}
      </Centered>
    )
  }

  if (!project) {
    return (
      <Centered>
        {t(
          'koder.jira.noBinding',
          'Este repositorio no tiene proyecto de Jira. Asígnalo en Ajustes · Repositorio · Proyecto de Jira por defecto.'
        )}
      </Centered>
    )
  }

  const linkedCount = countLinkedRows(rows)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {projectLabel(project)}
          </p>
          {/* The site is named because a repo can point at any of several, and the
              same project key exists on more than one of them. */}
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {[siteName, `${rows.length} issues`, `${linkedCount} con espacio`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
          onClick={() => void load(true)}
          aria-label={t('koder.jira.refresh', 'Volver a leer')}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {error ? <p className="px-3 py-2 text-[11px] text-destructive">{error}</p> : null}

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && !loading && !error ? (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {t('koder.jira.empty', 'Este proyecto no tiene issues visibles.')}
          </p>
        ) : null}
        {rows.map((row) => (
          <IssueRow
            key={row.issue.key}
            row={row}
            openLabel={t('koder.jira.open', 'Abrir en Jira')}
          />
        ))}
      </div>

      {/* Why stated: the list is one page of Jira, not the project's full backlog. */}
      {rows.length >= ISSUE_LIMIT ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground/70">
          {t('koder.jira.capped', 'Las {limit} más recientes por fecha de actualización.').replace(
            '{limit}',
            String(ISSUE_LIMIT)
          )}
        </p>
      ) : null}
    </div>
  )
}

function IssueRow({
  row,
  openLabel
}: {
  row: ProjectIssueRow
  openLabel: string
}): React.JSX.Element {
  const workspace = row.workspaces[0] ?? null
  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b border-border/30 px-3 py-1.5 transition-colors hover:bg-muted/30',
        row.isActiveWorkspace && 'bg-muted/40'
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-foreground/90">
          <span className="font-mono text-[10px] text-muted-foreground">{row.issue.key}</span>{' '}
          {row.issue.title}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {row.issue.status.name}
          {row.issue.assignee ? ` · ${row.issue.assignee.displayName}` : ''}
        </p>
        {workspace ? (
          <button
            type="button"
            onClick={() =>
              activateAndRevealWorktree(workspace.id, { navigationIntent: 'user-open' })
            }
            className={cn(
              'mt-0.5 truncate rounded px-1 py-px text-[10px] transition-colors',
              row.isActiveWorkspace
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {workspace.displayName}
            {row.workspaces.length > 1 ? ` +${row.workspaces.length - 1}` : ''}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => void window.api.shell.openUrl(row.issue.url).catch(() => {})}
        className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
        aria-label={openLabel}
        title={openLabel}
      >
        <ExternalLink className="size-3" />
      </button>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
