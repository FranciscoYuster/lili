/**
 * Which plugins this project's agents are actually loading.
 *
 * Derived from the skill discovery the panel already runs, not from a second
 * source: a discovered skill carries `sourceKind: 'plugin'` and the label of the
 * plugin that installed it, so grouping by that label is the whole join.
 *
 * The honest limit, and the panel says it out loud: this finds plugins that
 * ship skills. A plugin that contributes only an MCP server, a command or a
 * panel installs nothing under a skills root and cannot appear here. Counting
 * it as absent would be a lie; counting what we can see is not.
 */

export type HarnessPluginRow = {
  /** The plugin's label as discovery reported it; also the group key. */
  label: string
  /** Skills this plugin put in front of the agents. */
  skillCount: number
  /** False when every skill it ships is present but not installed. */
  anyInstalled: boolean
  /** Agent roots it reached, so a Codex-only plugin is visible as such. */
  providers: string[]
}

type PluginSkillLike = {
  sourceKind: string
  sourceLabel: string
  installed: boolean
  providers?: readonly string[]
}

export function buildHarnessPluginRows(
  skills: readonly PluginSkillLike[] | null | undefined
): HarnessPluginRow[] {
  const byLabel = new Map<string, HarnessPluginRow>()
  for (const skill of skills ?? []) {
    if (skill.sourceKind !== 'plugin') {
      continue
    }
    const label = skill.sourceLabel.trim()
    if (!label) {
      continue
    }
    const existing = byLabel.get(label)
    if (existing) {
      existing.skillCount += 1
      existing.anyInstalled = existing.anyInstalled || skill.installed
      for (const provider of skill.providers ?? []) {
        if (!existing.providers.includes(provider)) {
          existing.providers.push(provider)
        }
      }
      continue
    }
    byLabel.set(label, {
      label,
      skillCount: 1,
      anyInstalled: skill.installed,
      providers: [...new Set(skill.providers ?? [])]
    })
  }
  return [...byLabel.values()].sort(
    (left, right) => right.skillCount - left.skillCount || left.label.localeCompare(right.label)
  )
}

export function countPluginSkills(rows: readonly HarnessPluginRow[]): number {
  return rows.reduce((total, row) => total + row.skillCount, 0)
}
