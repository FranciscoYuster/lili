/**
 * Recovering `plugin@marketplace` from a skill's path, with no second file read.
 *
 * Claude Code installs a plugin under
 * `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, and that is the
 * same pair it uses as the key in `installed_plugins.json` and in a project's
 * `enabledPlugins`. A discovered skill already carries its `rootPath`, so the
 * reference can be read straight out of it — the panel does not have to open
 * the plugin registry to learn what the skills in front of it are called.
 *
 * The limit is honest and the UI repeats it: a path that does not pass through
 * a plugin cache yields nothing. A skill installed from a local directory, or
 * shipped inside the repository, has no `plugin@marketplace` name to recover
 * because it does not have one.
 */

export type PluginReference = {
  plugin: string
  marketplace: string
  /** The exact key `enabledPlugins` and `installed_plugins.json` use. */
  reference: string
}

// Forward slashes only: these paths come from skill discovery, which normalises.
const CACHE_SEGMENT = /(?:^|\/)plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+(?:\/|$)/

export function pluginReferenceFromPath(path: string | null | undefined): PluginReference | null {
  if (!path) {
    return null
  }
  const match = CACHE_SEGMENT.exec(path.replace(/\\/g, '/'))
  if (!match) {
    return null
  }
  const [, marketplace, plugin] = match
  if (!marketplace || !plugin) {
    return null
  }
  return { plugin, marketplace, reference: `${plugin}@${marketplace}` }
}

type SkillLike = {
  sourceKind: string
  sourceLabel: string
  rootPath: string
  installed: boolean
}

export type InstalledPluginRow = PluginReference & {
  label: string
  skillCount: number
  anyInstalled: boolean
}

/** One row per plugin whose reference could be recovered, busiest first. */
export function installedPluginRows(
  skills: readonly SkillLike[] | null | undefined
): InstalledPluginRow[] {
  const byReference = new Map<string, InstalledPluginRow>()
  for (const skill of skills ?? []) {
    if (skill.sourceKind !== 'plugin') {
      continue
    }
    const reference = pluginReferenceFromPath(skill.rootPath)
    if (!reference) {
      continue
    }
    const existing = byReference.get(reference.reference)
    if (existing) {
      existing.skillCount += 1
      existing.anyInstalled = existing.anyInstalled || skill.installed
      continue
    }
    byReference.set(reference.reference, {
      ...reference,
      label: skill.sourceLabel.trim() || reference.plugin,
      skillCount: 1,
      anyInstalled: skill.installed
    })
  }
  return [...byReference.values()].sort(
    (left, right) =>
      right.skillCount - left.skillCount || left.reference.localeCompare(right.reference)
  )
}
