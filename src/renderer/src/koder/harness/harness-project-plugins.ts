/**
 * The project's own plugin configuration: `.claude/settings.json`.
 *
 * Two keys, and they do different jobs. `extraKnownMarketplaces` lets the
 * repository say where a marketplace lives, so a clone does not depend on what
 * happens to be registered on one machine — that is what "a marketplace
 * isolated per project" is on disk. `enabledPlugins` says which plugins this
 * project turns on.
 *
 * The correction that shapes the whole step: **enabling is not installing.**
 * Claude Code fetches a plugin with an external source only when user settings,
 * an untracked `.claude/settings.local.json`, `--settings` or managed settings
 * enable it. A `true` in the committed project file does not trigger a fetch,
 * so a fresh clone still needs `claude plugin install <plugin>@<marketplace>
 * --scope project`. The generator writes the file and hands over those commands
 * rather than implying the repo is ready.
 *
 * Writes here are additive only. Removing a plugin, or repointing a marketplace
 * name someone else's work depends on, is a deliberate edit — not the side
 * effect of a cleared checkbox. A name already declared with a different source
 * is reported as a collision and left exactly as it was.
 */

export const PROJECT_SETTINGS_FILE = '.claude/settings.json'

/** `owner/repo`, the portable form. The CLI writes an absolute directory path
 *  when it registers a local marketplace, and that does not survive a clone. */
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export function isMarketplaceRepo(value: string): boolean {
  return REPO.test(value.trim())
}

export type MarketplaceDeclaration = { name: string; repo: string }

export type ProjectPluginState = {
  /** References the project already enables. */
  enabled: string[]
  /** Marketplace name to the `owner/repo` it points at, or null for any other source shape. */
  declared: Record<string, string | null>
  /** False when the file exists but is not JSON we can safely rewrite. */
  readable: boolean
  /** False when the file is absent, so the plan can say "create", not "merge". */
  exists: boolean
}

const UNREADABLE: ProjectPluginState = {
  enabled: [],
  declared: {},
  readable: false,
  exists: true
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readProjectPlugins(content: string | null): ProjectPluginState {
  if (content === null) {
    return { enabled: [], declared: {}, readable: true, exists: false }
  }
  if (content.trim() === '') {
    return { enabled: [], declared: {}, readable: true, exists: true }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return UNREADABLE
  }
  const root = plainObject(parsed)
  if (!root) {
    return UNREADABLE
  }
  const enabledPlugins = root.enabledPlugins
  const enabledMap = enabledPlugins === undefined ? {} : plainObject(enabledPlugins)
  const marketplaces = root.extraKnownMarketplaces
  const marketplaceMap = marketplaces === undefined ? {} : plainObject(marketplaces)
  if (!enabledMap || !marketplaceMap) {
    return UNREADABLE
  }
  // Only `true` counts: an explicit `false` is a decision to keep a plugin off,
  // and reporting it as enabled would invite a write that reverses it.
  const enabled = Object.entries(enabledMap)
    .filter(([, value]) => value === true)
    .map(([reference]) => reference)
  const declared: Record<string, string | null> = {}
  for (const [name, entry] of Object.entries(marketplaceMap)) {
    const source = plainObject(plainObject(entry)?.source ?? null)
    const repo = source?.source === 'github' && typeof source.repo === 'string' ? source.repo : null
    declared[name] = repo
  }
  return { enabled, declared, readable: true, exists: true }
}

/** References selected but not yet enabled, in selection order, deduplicated. */
export function pluginsToAdd(state: ProjectPluginState, selected: readonly string[]): string[] {
  const already = new Set(state.enabled)
  const seen = new Set<string>()
  return selected.filter((reference) => {
    if (already.has(reference) || seen.has(reference)) {
      return false
    }
    seen.add(reference)
    return true
  })
}

export type MarketplaceSplit = {
  /** Names to write: either absent, or already pointing at the same repo. */
  add: MarketplaceDeclaration[]
  /** Names the file already gives a different source. Never rewritten. */
  collisions: string[]
}

export function marketplacesToDeclare(
  state: ProjectPluginState,
  requested: readonly MarketplaceDeclaration[]
): MarketplaceSplit {
  const split: MarketplaceSplit = { add: [], collisions: [] }
  for (const declaration of requested) {
    const name = declaration.name.trim()
    const repo = declaration.repo.trim()
    if (!name || !isMarketplaceRepo(repo)) {
      continue
    }
    if (!(name in state.declared)) {
      split.add.push({ name, repo })
      continue
    }
    const current = state.declared[name]
    if (current === repo) {
      // Already says exactly this; writing it again changes nothing.
      continue
    }
    split.collisions.push(name)
  }
  return split
}

/** The settings file with both additions merged in; every other key survives. */
export function mergeProjectSettings(
  content: string | null,
  added: {
    plugins: readonly string[]
    marketplaces: readonly MarketplaceDeclaration[]
  }
): string {
  const base =
    content === null || content.trim() === ''
      ? {}
      : ((JSON.parse(content) as Record<string, unknown>) ?? {})
  const merged: Record<string, unknown> = { ...base }
  if (added.marketplaces.length > 0) {
    const existing = plainObject(base.extraKnownMarketplaces) ?? {}
    const extraKnownMarketplaces: Record<string, unknown> = { ...existing }
    for (const declaration of added.marketplaces) {
      extraKnownMarketplaces[declaration.name] = {
        source: { source: 'github', repo: declaration.repo }
      }
    }
    merged.extraKnownMarketplaces = extraKnownMarketplaces
  }
  if (added.plugins.length > 0) {
    const existing = plainObject(base.enabledPlugins) ?? {}
    const enabledPlugins: Record<string, unknown> = { ...existing }
    for (const reference of added.plugins) {
      enabledPlugins[reference] = true
    }
    merged.enabledPlugins = enabledPlugins
  }
  return `${JSON.stringify(merged, null, 2)}\n`
}

/**
 * What a clone still has to run. Enabling a plugin in the committed project
 * settings does not fetch it, so these commands are part of the deliverable,
 * not a footnote.
 */
export function pluginInstallCommands(references: readonly string[]): string[] {
  return references.map((reference) => `claude plugin install ${reference} --scope project`)
}
