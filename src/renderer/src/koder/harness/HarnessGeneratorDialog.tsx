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
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
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
  blankDraft,
  mongoDbDraft,
  toMcpInput,
  validateMcpDraft,
  type HarnessMcpDraft
} from './harness-mcp-draft'
import { Field, PlanRow } from './harness-generator-parts'
import { actionLabel, reasonLabel } from './harness-generator-labels'

type Phase = 'form' | 'plan' | 'done'

export type HarnessGeneratorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: RuntimeFileOperationArgs
  worktreePath: string
  /** Repository folder name, used as the default project name. */
  defaultProjectName: string
  /** Called after a write so the panel can re-read what it now shows. */
  onWritten: () => void
}

export function HarnessGeneratorDialog({
  open,
  onOpenChange,
  context,
  worktreePath,
  defaultProjectName,
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
  const [plan, setPlan] = useState<HarnessPlanRow[]>([])
  const [result, setResult] = useState<HarnessWriteResult | null>(null)

  const draftErrors = useMemo(
    () => new Map(drafts.map((draft) => [draft.id, validateMcpDraft(draft)])),
    [drafts]
  )
  const formValid = [...draftErrors.values()].every((errors) => errors.length === 0)

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
        buildHarnessPlan({ projectName, summary, stack, mcp: drafts.map(toMcpInput) }, existing)
      )
      setPhase('plan')
    } catch (caught) {
      setError(extractIpcErrorMessage(caught, 'No se pudo leer el proyecto.'))
    } finally {
      setBusy(false)
    }
  }, [context, drafts, projectName, stack, summary, worktreePath])

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

            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-[11px] font-medium text-foreground">
                {t('koder.harness.generate.mcp', 'MCP del proyecto (.mcp.json)')}
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                {t(
                  'koder.harness.generate.mcpHint',
                  'Pide el NOMBRE de la variable de entorno, nunca el valor: el archivo se commitea y escribe ${NOMBRE}.'
                )}
              </p>
              {drafts.map((draft) => {
                const errors = draftErrors.get(draft.id) ?? []
                return (
                  <div key={draft.id} className="space-y-2 rounded border border-border/60 p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        id={`${fieldId}-${draft.id}-name`}
                        label={t('koder.harness.generate.serverName', 'Servidor')}
                        value={draft.name}
                        onChange={(value) => patch(draft.id, { name: value })}
                        invalid={errors.includes('nameRequired') || errors.includes('nameInvalid')}
                      />
                      <Field
                        id={`${fieldId}-${draft.id}-command`}
                        label={t('koder.harness.generate.command', 'Comando')}
                        value={draft.command}
                        onChange={(value) => patch(draft.id, { command: value })}
                        invalid={errors.includes('commandRequired')}
                      />
                    </div>
                    <Field
                      id={`${fieldId}-${draft.id}-args`}
                      label={t('koder.harness.generate.args', 'Argumentos')}
                      value={draft.args}
                      onChange={(value) => patch(draft.id, { args: value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        id={`${fieldId}-${draft.id}-key`}
                        label={t('koder.harness.generate.envKey', 'Variable que espera el MCP')}
                        value={draft.envKey}
                        onChange={(value) => patch(draft.id, { envKey: value })}
                        invalid={errors.includes('envKeyRequired')}
                      />
                      <Field
                        id={`${fieldId}-${draft.id}-var`}
                        label={t('koder.harness.generate.envVar', 'Variable del proyecto (nombre)')}
                        placeholder="MONGODB_URI"
                        value={draft.envVar}
                        onChange={(value) => patch(draft.id, { envVar: value })}
                        invalid={
                          errors.includes('envVarRequired') ||
                          errors.includes('envVarInvalid') ||
                          errors.includes('envVarLooksLikeSecret')
                        }
                      />
                    </div>
                    {errors.includes('envVarLooksLikeSecret') ? (
                      <p className="text-[10px] text-rose-400">
                        {t(
                          'koder.harness.generate.secretRefused',
                          'Eso parece el valor, no el nombre. Este archivo se commitea: escribe el nombre de la variable.'
                        )}
                      </p>
                    ) : null}
                    {drafts.length > 1 ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-rose-400"
                        onClick={() =>
                          setDrafts((current) => current.filter((entry) => entry.id !== draft.id))
                        }
                      >
                        <Trash2 className="size-3" />
                        {t('koder.harness.generate.removeServer', 'Quitar')}
                      </button>
                    ) : null}
                  </div>
                )
              })}
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setDrafts((current) => [...current, blankDraft(`mcp-${current.length + 1}`)])
                }
              >
                <Plus className="size-3" />
                {t('koder.harness.generate.addServer', 'Agregar servidor')}
              </button>
            </div>
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
