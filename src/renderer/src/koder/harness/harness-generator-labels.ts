/**
 * The plan's machine tokens turned into copy.
 *
 * `harness-plan` deliberately returns action and reason as tokens with no
 * language in them, so the decision stays testable without asserting on
 * sentences. This is the only place those tokens become words.
 */

import type { HarnessPlanAction, HarnessPlanReason, HarnessPlanRow } from './harness-plan'

export type Translate = (key: string, fallback: string) => string

export function actionLabel(t: Translate, action: HarnessPlanAction): string {
  const labels: Record<HarnessPlanAction, string> = {
    create: t('koder.harness.generate.actionCreate', 'crear'),
    merge: t('koder.harness.generate.actionMerge', 'sumar'),
    keep: t('koder.harness.generate.actionKeep', 'dejar'),
    conflict: t('koder.harness.generate.actionConflict', 'conflicto')
  }
  return labels[action]
}

export function reasonLabel(t: Translate, row: HarnessPlanRow): string {
  const detail = row.detail?.join(', ') ?? ''
  const reasons: Record<HarnessPlanReason, string> = {
    absent: t('koder.harness.generate.reasonAbsent', 'no existe'),
    importAdded: t(
      'koder.harness.generate.reasonImportAdded',
      'ya existe: se agrega @AGENTS.md arriba y lo demás queda igual'
    ),
    alreadyImports: t('koder.harness.generate.reasonAlreadyImports', 'ya importa AGENTS.md'),
    exists: t('koder.harness.generate.reasonExists', 'ya existe: no se reescribe'),
    serversAdded: t('koder.harness.generate.reasonServersAdded', 'se agregan: {detail}'),
    serversTaken: t(
      'koder.harness.generate.reasonServersTaken',
      'esas claves ya están tomadas: {detail}'
    ),
    unparseable: t(
      'koder.harness.generate.reasonUnparseable',
      'no es JSON válido: no se toca para no perder lo que tenga'
    ),
    nothingRequested: t(
      'koder.harness.generate.reasonNothingRequested',
      'nada pedido para este archivo'
    ),
    pluginsAdded: t('koder.harness.generate.reasonPluginsAdded', 'se habilitan: {detail}'),
    pluginsAlreadyEnabled: t(
      'koder.harness.generate.reasonPluginsAlreadyEnabled',
      'el proyecto ya los habilita: {detail}'
    ),
    marketplaceCollision: t(
      'koder.harness.generate.reasonMarketplaceCollision',
      'ese nombre ya apunta a otra fuente: {detail}. Repuntarlo redirige todo lo instalado bajo él.'
    )
  }
  return reasons[row.reason].replace('{detail}', detail)
}
