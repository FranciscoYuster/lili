/**
 * Creates this project's harness — or reports, file by file, why it will not.
 *
 * The flow is read, plan, confirm, write, in that order and never collapsed. An
 * existing project already works: its AGENTS.md was written by someone, its
 * `.mcp.json` points at servers that run. So the generator reads what is there
 * first, shows exactly what it would do to each path, and writes nothing until
 * that plan is accepted. On an empty project the same flow simply shows five
 * creates.
 *
 * The one input it refuses to accept is a secret. For an MCP server it asks for
 * the NAME of an environment variable the project already defines and writes
 * `${NAME}` into the committed file; a pasted connection string is rejected
 * rather than warned about, because `.mcp.json` goes into git and a credential
 * in git history survives its own deletion.
 */

import { useCallback, useId, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import { buildHarnessPlan, countHarnessWrites, type HarnessPlanRow } from './harness-plan'
import { applyHarnessPlan, readExistingHarness, type HarnessWriteResult } from './harness-generate'
import {
  mongoDbDraft,
  toMcpInput,
  validateMcpDraft,
  type HarnessMcpDraft
} from './harness-mcp-draft'
import { Field, PlanRow } from './harness-generator-parts'
import { McpSection, PluginsSection } from './harness-generator-sections'
import { installedPluginRows } from './harness-plugin-identity'
import { isMarketplaceRepo, pluginInstallCommands } from './harness-project-plugins'
import { actionLabel, reasonLabel } from './harness-generator-labels'

type Phase = 'form' | 'plan' | 'done'

export type HarnessGeneratorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: RuntimeFileOperationArgs
  worktreePath: string
  /** Repository folder name, used as the default project name. */
  defaultProjectName: string
  /** The skills the panel already discovered; the plugin list is derived from them. */
  skills: readonly {
    sourceKind: string
    sourceLabel: string
    rootPath: string
    installed: boolean
  }[]
  /** Called after a write so the panel can re-read what it now shows. */
  onWritten: () => void
}

export function HarnessGeneratorDialog({
  open,
  onOpenChange,
  context,
  worktreePath,
  defaultProjectName,
  skills,
  onWritten
}: HarnessGeneratorDialogProps): React.JSX.Element {
  const t = useTranslate()
  const fieldId = useId()
  const [phase, setPhase] = useState<Phase>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projectName, setProjectName] = useState(defaultProjectName)
  const [summary, setSummary] = useState('')
  const [stack, setStack] = useState('')
  const [drafts, setDrafts] = useState<HarnessMcpDraft[]>([mongoDbDraft('mcp-1')])
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set())
  const [marketplaceRepos, setMarketplaceRepos] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<HarnessPlanRow[]>([])
  const [result, setResult] = useState<HarnessWriteResult | null>(null)

  const draftErrors = useMemo(
    () => new Map(drafts.map((draft) => [draft.id, validateMcpDraft(draft)])),
    [drafts]
  )
  const availablePlugins = useMemo(() => installedPluginRows(skills), [skills])
  // A repo typed and then mistyped must block the plan, or the generator would
  // silently drop the declaration and write only enabledPlugins.
  const reposValid = Object.values(marketplaceRepos).every(
    (repo) => repo.trim() === '' || isMarketplaceRepo(repo)
  )
  const formValid = reposValid && [...draftErrors.values()].every((errors) => errors.length === 0)

  const togglePlugin = useCallback((reference: string) => {
    setSelectedPlugins((current) => {
      const next = new Set(current)
      if (next.has(reference)) {
        next.delete(reference)
      } else {
        next.add(reference)
      }
      return next
    })
  }, [])

  const patch = useCallback((id: string, change: Partial<HarnessMcpDraft>) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, ...change } : draft))
    )
  }, [])

  const readAndPlan = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const existing = await readExistingHarness(
        { target: context.target, worktreeId: context.worktreeId ?? null },
        worktreePath
      )
      setPlan(
        buildHarnessPlan(
          {
            projectName,
            summary,
            stack,
            mcp: drafts.map(toMcpInput),
            plugins: [...selectedPlugins],
            marketplaces: Object.entries(marketplaceRepos)
              .filter(([, repo]) => isMarketplaceRepo(repo))
              .map(([name, repo]) => ({ name, repo: repo.trim() }))
          },
          existing
        )
      )
      setPhase('plan')
    } catch (caught) {
      setError(extractIpcErrorMessage(caught, 'No se pudo leer el proyecto.'))
    } finally {
      setBusy(false)
    }
  }, [
    context,
    drafts,
    marketplaceRepos,
    projectName,
    selectedPlugins,
    stack,
    summary,
    worktreePath
  ])

  const write = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const written = await applyHarnessPlan(context, worktreePath, plan)
      setResult(written)
      setPhase('done')
      onWritten()
    } catch (caught) {
      setError(extractIpcErrorMessage(caught, 'No se pudo escribir el harness.'))
    } finally {
      setBusy(false)
    }
  }, [context, onWritten, plan, worktreePath])

  const writeCount = countHarnessWrites(plan)
  const installCommands = useMemo(
    () => pluginInstallCommands([...selectedPlugins]),
    [selectedPlugins]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('koder.harness.generate.title', 'Crear el harness')}</DialogTitle>
          <DialogDescription>
            {t(
              'koder.harness.generate.subtitle',
              'AGENTS.md es la fuente; CLAUDE.md lo importa con @. Lee primero lo que ya existe y no sobrescribe nada sin confirmación.'
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'form' ? (
          <div className="scrollbar-sleek max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            <Field
              id={`${fieldId}-name`}
              label={t('koder.harness.generate.projectName', 'Nombre del proyecto')}
              value={projectName}
              onChange={setProjectName}
            />
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {t('koder.harness.generate.summary', 'Para qué es este proyecto (una frase)')}
              </p>
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={2}
                className="text-[12px]"
              />
              <p className="text-[10px] text-muted-foreground/70">
                {t(
                  'koder.harness.generate.summaryHint',
                  'Si lo dejas vacío queda marcado como TODO en AGENTS.md. Un agente obedece lo que haya ahí.'
                )}
              </p>
            </div>
            <Field
              id={`${fieldId}-stack`}
              label={t('koder.harness.generate.stack', 'Stack')}
              placeholder="Next.js 16 · MongoDB · Vercel"
              value={stack}
              onChange={setStack}
            />

            <McpSection
              t={t}
              fieldId={fieldId}
              drafts={drafts}
              errorsFor={(id) => draftErrors.get(id) ?? []}
              onPatch={patch}
              onChange={setDrafts}
            />

            <PluginsSection
              t={t}
              fieldId={fieldId}
              available={availablePlugins}
              selected={selectedPlugins}
              repos={marketplaceRepos}
              onToggle={togglePlugin}
              onRepo={(marketplace, repo) =>
                setMarketplaceRepos((current) => ({ ...current, [marketplace]: repo }))
              }
            />
          </div>
        ) : null}

        {phase === 'plan' ? (
          <div className="scrollbar-sleek max-h-[52vh] overflow-y-auto">
            {plan.map((row) => (
              <PlanRow
                key={row.relativePath}
                relativePath={row.relativePath}
                action={row.action}
                actionLabel={actionLabel(t, row.action)}
                reason={reasonLabel(t, row)}
              />
            ))}
            <p className="pt-2 text-[10px] text-muted-foreground/70">
              {t(
                'koder.harness.generate.planFootnote',
                'Nada de lo marcado como «dejar» o «conflicto» se toca. Un archivo que ya existe no se reescribe.'
              )}
            </p>
          </div>
        ) : null}

        {phase === 'done' && result ? (
          <div className="scrollbar-sleek max-h-[52vh] space-y-2 overflow-y-auto">
            {result.written.length > 0 ? (
              <div>
                <p className="text-[11px] text-emerald-500">
                  {t('koder.harness.generate.writtenCount', 'Escritos: {count}').replace(
                    '{count}',
                    String(result.written.length)
                  )}
                </p>
                {result.written.map((path) => (
                  <p key={path} className="font-mono text-[11px] text-muted-foreground">
                    {path}
                  </p>
                ))}
              </div>
            ) : null}
            {installCommands.length > 0 ? (
              <div className="rounded border border-amber-500/40 p-2">
                <p className="text-[11px] text-amber-500">
                  {t(
                    'koder.harness.generate.installStill',
                    'Habilitar no instala. En cada clon falta correr:'
                  )}
                </p>
                {installCommands.map((command) => (
                  <p key={command} className="font-mono text-[11px] text-foreground">
                    {command}
                  </p>
                ))}
              </div>
            ) : null}
            {result.failed.length > 0 ? (
              <div>
                <p className="text-[11px] text-rose-400">
                  {t('koder.harness.generate.failedCount', 'Fallaron: {count}').replace(
                    '{count}',
                    String(result.failed.length)
                  )}
                </p>
                {result.failed.map((failure) => (
                  <p key={failure.relativePath} className="font-mono text-[11px] text-rose-400">
                    {failure.relativePath}: {failure.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-[11px] text-rose-400">{error}</p> : null}

        <DialogFooter>
          {phase === 'form' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('koder.harness.generate.cancel', 'Cancelar')}
              </Button>
              <Button disabled={busy || !formValid} onClick={() => void readAndPlan()}>
                {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {t('koder.harness.generate.read', 'Leer el proyecto')}
              </Button>
            </>
          ) : null}
          {phase === 'plan' ? (
            <>
              <Button variant="ghost" onClick={() => setPhase('form')}>
                {t('koder.harness.generate.back', 'Volver')}
              </Button>
              <Button disabled={busy || writeCount === 0} onClick={() => void write()}>
                {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {writeCount === 0
                  ? t('koder.harness.generate.nothingToWrite', 'Nada que escribir')
                  : t('koder.harness.generate.write', 'Escribir {count} archivos').replace(
                      '{count}',
                      String(writeCount)
                    )}
              </Button>
            </>
          ) : null}
          {phase === 'done' ? (
            <Button onClick={() => onOpenChange(false)}>
              {t('koder.harness.generate.close', 'Cerrar')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
