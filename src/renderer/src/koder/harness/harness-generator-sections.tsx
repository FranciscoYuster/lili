/**
 * The two interactive sections of the generator form, kept out of the dialog so
 * that file stays flow and these stay markup.
 */

import { Plus, Trash2 } from 'lucide-react'
import { Field } from './harness-generator-parts'
import type { HarnessMcpDraft, HarnessMcpDraftError } from './harness-mcp-draft'
import { blankDraft } from './harness-mcp-draft'
import type { InstalledPluginRow } from './harness-plugin-identity'
import { isMarketplaceRepo } from './harness-project-plugins'

type Translate = (key: string, fallback: string) => string

export function McpSection({
  t,
  fieldId,
  drafts,
  errorsFor,
  onPatch,
  onChange
}: {
  t: Translate
  fieldId: string
  drafts: HarnessMcpDraft[]
  errorsFor: (id: string) => HarnessMcpDraftError[]
  onPatch: (id: string, change: Partial<HarnessMcpDraft>) => void
  onChange: (next: HarnessMcpDraft[]) => void
}): React.JSX.Element {
  return (
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
        const errors = errorsFor(draft.id)
        return (
          <div key={draft.id} className="space-y-2 rounded border border-border/60 p-2">
            <div className="grid grid-cols-2 gap-2">
              <Field
                id={`${fieldId}-${draft.id}-name`}
                label={t('koder.harness.generate.serverName', 'Servidor')}
                value={draft.name}
                onChange={(value) => onPatch(draft.id, { name: value })}
                invalid={errors.includes('nameRequired') || errors.includes('nameInvalid')}
              />
              <Field
                id={`${fieldId}-${draft.id}-command`}
                label={t('koder.harness.generate.command', 'Comando')}
                value={draft.command}
                onChange={(value) => onPatch(draft.id, { command: value })}
                invalid={errors.includes('commandRequired')}
              />
            </div>
            <Field
              id={`${fieldId}-${draft.id}-args`}
              label={t('koder.harness.generate.args', 'Argumentos')}
              value={draft.args}
              onChange={(value) => onPatch(draft.id, { args: value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                id={`${fieldId}-${draft.id}-key`}
                label={t('koder.harness.generate.envKey', 'Variable que espera el MCP')}
                value={draft.envKey}
                onChange={(value) => onPatch(draft.id, { envKey: value })}
                invalid={errors.includes('envKeyRequired')}
              />
              <Field
                id={`${fieldId}-${draft.id}-var`}
                label={t('koder.harness.generate.envVar', 'Variable del proyecto (nombre)')}
                placeholder="MONGODB_URI"
                value={draft.envVar}
                onChange={(value) => onPatch(draft.id, { envVar: value })}
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
                onClick={() => onChange(drafts.filter((entry) => entry.id !== draft.id))}
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
        onClick={() => onChange([...drafts, blankDraft(`mcp-${drafts.length + 1}`)])}
      >
        <Plus className="size-3" />
        {t('koder.harness.generate.addServer', 'Agregar servidor')}
      </button>
    </div>
  )
}

export function PluginsSection({
  t,
  fieldId,
  available,
  selected,
  repos,
  onToggle,
  onRepo
}: {
  t: Translate
  fieldId: string
  available: InstalledPluginRow[]
  selected: Set<string>
  /** Marketplace name to the `owner/repo` the user typed for it. */
  repos: Record<string, string>
  onToggle: (reference: string) => void
  onRepo: (marketplace: string, repo: string) => void
}): React.JSX.Element {
  // One repo field per marketplace, not per plugin: the declaration is the
  // marketplace's, and five plugins from one marketplace need one address.
  const marketplaces = [
    ...new Set(available.filter((row) => selected.has(row.reference)).map((row) => row.marketplace))
  ]
  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="text-[11px] font-medium text-foreground">
        {t('koder.harness.generate.plugins', 'Plugins del proyecto (.claude/settings.json)')}
      </p>
      {available.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70 italic">
          {t(
            'koder.harness.generate.noPluginsFound',
            'Ningún plugin instalado aporta skills, así que no hay ninguno que nombrar aquí.'
          )}
        </p>
      ) : (
        available.map((row) => (
          <label
            key={row.reference}
            className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-muted/40"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(row.reference)}
              onChange={() => onToggle(row.reference)}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-foreground">{row.label}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {row.reference} · {row.skillCount} skills
              </span>
            </span>
          </label>
        ))
      )}
      {marketplaces.map((marketplace) => {
        const repo = repos[marketplace] ?? ''
        return (
          <Field
            key={marketplace}
            id={`${fieldId}-mkt-${marketplace}`}
            label={t(
              'koder.harness.generate.marketplaceRepo',
              'Repo del marketplace «{name}»'
            ).replace('{name}', marketplace)}
            placeholder="Koder-SpA/claude-mods"
            hint={t(
              'koder.harness.generate.marketplaceRepoHint',
              'Opcional. Si lo pones, el repo declara el marketplace y el clon no depende de lo que tengas tú registrado.'
            )}
            value={repo}
            onChange={(value) => onRepo(marketplace, value)}
            invalid={repo.trim() !== '' && !isMarketplaceRepo(repo)}
          />
        )
      })}
      <p className="text-[10px] text-amber-500">
        {t(
          'koder.harness.generate.enableIsNotInstall',
          'Habilitar no es instalar: un clon igual tiene que correr claude plugin install. Los comandos salen al final.'
        )}
      </p>
    </div>
  )
}
