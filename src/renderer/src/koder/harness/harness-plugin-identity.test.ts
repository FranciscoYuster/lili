import { describe, expect, it } from 'vitest'
import { installedPluginRows, pluginReferenceFromPath } from './harness-plugin-identity'

const CACHE = '/Users/me/.claude/plugins/cache'

describe('pluginReferenceFromPath', () => {
  it('reads the reference out of a real cache path', () => {
    expect(pluginReferenceFromPath(`${CACHE}/koderspa/task-router/1.1.0/skills/scout`)).toEqual({
      marketplace: 'koderspa',
      plugin: 'task-router',
      reference: 'task-router@koderspa'
    })
  })

  it('works when the version directory is the last segment', () => {
    expect(pluginReferenceFromPath(`${CACHE}/caveman/caveman/0d95a81d35a9`)?.reference).toBe(
      'caveman@caveman'
    )
  })

  it('accepts a Windows path', () => {
    expect(
      pluginReferenceFromPath('C:\\Users\\me\\.claude\\plugins\\cache\\engram\\engram\\0.1.1')
        ?.reference
    ).toBe('engram@engram')
  })

  it('returns null for a skill that is not in a plugin cache', () => {
    expect(pluginReferenceFromPath('/repo/.agents/skills/deploy')).toBeNull()
    expect(pluginReferenceFromPath('/Users/me/.claude/skills/deploy')).toBeNull()
    expect(pluginReferenceFromPath(null)).toBeNull()
  })
})

const skill = (
  rootPath: string,
  over: Partial<{ sourceLabel: string; installed: boolean }> = {}
) => ({
  sourceKind: 'plugin',
  sourceLabel: 'task-router',
  installed: true,
  rootPath,
  ...over
})

describe('installedPluginRows', () => {
  it('groups by reference and counts skills, busiest first', () => {
    const rows = installedPluginRows([
      skill(`${CACHE}/koderspa/task-router/1.1.0/skills/a`),
      skill(`${CACHE}/koderspa/task-router/1.1.0/skills/b`),
      skill(`${CACHE}/caveman/caveman/abc/skills/c`, { sourceLabel: 'caveman' })
    ])
    expect(rows.map((row) => [row.reference, row.skillCount])).toEqual([
      ['task-router@koderspa', 2],
      ['caveman@caveman', 1]
    ])
  })

  it('drops skills whose reference cannot be recovered rather than inventing one', () => {
    expect(installedPluginRows([skill('/repo/.agents/skills/deploy')])).toEqual([])
  })

  it('ignores skills that did not come from a plugin', () => {
    expect(
      installedPluginRows([{ ...skill(`${CACHE}/koderspa/task-router/1.0.0`), sourceKind: 'home' }])
    ).toEqual([])
  })

  it('marks a plugin installed when any of its skills is', () => {
    const rows = installedPluginRows([
      skill(`${CACHE}/koderspa/task-router/1.1.0/skills/a`, { installed: false }),
      skill(`${CACHE}/koderspa/task-router/1.1.0/skills/b`, { installed: true })
    ])
    expect(rows[0].anyInstalled).toBe(true)
  })

  it('falls back to the plugin name when the label is blank', () => {
    expect(
      installedPluginRows([skill(`${CACHE}/koderspa/task-router/1.1.0`, { sourceLabel: '  ' })])[0]
        .label
    ).toBe('task-router')
  })
})
