import { describe, expect, it } from 'vitest'
import { buildHarnessPluginRows, countPluginSkills } from './harness-plugins'

type SkillFixture = {
  sourceKind: string
  sourceLabel: string
  installed: boolean
  providers: string[]
}

const skill = (over: Partial<SkillFixture> = {}): SkillFixture => ({
  sourceKind: 'plugin',
  sourceLabel: 'task-router',
  installed: true,
  providers: ['claude'],
  ...over
})

describe('buildHarnessPluginRows', () => {
  it('groups a plugin’s skills into one row', () => {
    const rows = buildHarnessPluginRows([skill(), skill(), skill({ sourceLabel: 'harness' })])
    expect(rows.map((row) => [row.label, row.skillCount])).toEqual([
      ['task-router', 2],
      ['harness', 1]
    ])
  })

  it('ignores skills that did not come from a plugin', () => {
    expect(
      buildHarnessPluginRows([skill({ sourceKind: 'repo' }), skill({ sourceKind: 'home' })])
    ).toEqual([])
  })

  it('keeps a plugin whose skills are present but not installed', () => {
    const rows = buildHarnessPluginRows([skill({ installed: false })])
    expect(rows[0]?.anyInstalled).toBe(false)
  })

  it('marks installed when any one of its skills is', () => {
    const rows = buildHarnessPluginRows([skill({ installed: false }), skill()])
    expect(rows[0]?.anyInstalled).toBe(true)
  })

  it('unions the agents a plugin reaches, without repeating one', () => {
    const rows = buildHarnessPluginRows([
      skill({ providers: ['claude'] }),
      skill({ providers: ['claude', 'codex'] })
    ])
    expect(rows[0]?.providers).toEqual(['claude', 'codex'])
  })

  it('drops a blank label rather than grouping under an empty name', () => {
    expect(buildHarnessPluginRows([skill({ sourceLabel: '   ' })])).toEqual([])
  })

  it('returns nothing for an empty or absent list', () => {
    expect(buildHarnessPluginRows([])).toEqual([])
    expect(buildHarnessPluginRows(null)).toEqual([])
  })
})

describe('countPluginSkills', () => {
  it('totals the skills across plugins', () => {
    expect(
      countPluginSkills(buildHarnessPluginRows([skill(), skill({ sourceLabel: 'harness' })]))
    ).toBe(2)
  })
})
