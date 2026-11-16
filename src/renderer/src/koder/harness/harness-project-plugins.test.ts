import { describe, expect, it } from 'vitest'
import {
  isMarketplaceRepo,
  marketplacesToDeclare,
  mergeProjectSettings,
  pluginInstallCommands,
  pluginsToAdd,
  readProjectPlugins
} from './harness-project-plugins'

const settings = (value: unknown): string => JSON.stringify(value, null, 2)

describe('readProjectPlugins', () => {
  it('reports an absent file as absent, not as empty', () => {
    expect(readProjectPlugins(null)).toEqual({
      enabled: [],
      declared: {},
      readable: true,
      exists: false
    })
  })

  it('reads enabled references and declared marketplaces', () => {
    const state = readProjectPlugins(
      settings({
        enabledPlugins: { 'task-router@koderspa': true },
        extraKnownMarketplaces: {
          koderspa: { source: { source: 'github', repo: 'Koder-SpA/claude-mods' } }
        }
      })
    )
    expect(state.enabled).toEqual(['task-router@koderspa'])
    expect(state.declared).toEqual({ koderspa: 'Koder-SpA/claude-mods' })
  })

  it('records a non-github marketplace source as declared but unknown', () => {
    const state = readProjectPlugins(
      settings({
        extraKnownMarketplaces: { local: { source: { source: 'directory', path: '/x' } } }
      })
    )
    expect(state.declared).toEqual({ local: null })
  })

  it('does not report an explicitly disabled plugin as enabled', () => {
    expect(
      readProjectPlugins(settings({ enabledPlugins: { 'caveman@caveman': false } })).enabled
    ).toEqual([])
  })

  it('treats settings with neither key as readable and empty', () => {
    const state = readProjectPlugins(settings({ permissions: { allow: [] } }))
    expect(state).toEqual({ enabled: [], declared: {}, readable: true, exists: true })
  })

  it('marks a file it cannot parse unreadable instead of guessing', () => {
    expect(readProjectPlugins('{ broken').readable).toBe(false)
    expect(readProjectPlugins('[]').readable).toBe(false)
    expect(readProjectPlugins(settings({ enabledPlugins: [] })).readable).toBe(false)
    expect(readProjectPlugins(settings({ extraKnownMarketplaces: 'x' })).readable).toBe(false)
  })
})

describe('isMarketplaceRepo', () => {
  it('accepts owner/repo and rejects anything else', () => {
    expect(isMarketplaceRepo('Koder-SpA/claude-mods')).toBe(true)
    expect(isMarketplaceRepo('https://github.com/Koder-SpA/claude-mods')).toBe(false)
    expect(isMarketplaceRepo('/Users/me/marketplaces/koderspa')).toBe(false)
    expect(isMarketplaceRepo('koderspa')).toBe(false)
  })
})

describe('pluginsToAdd', () => {
  const state = readProjectPlugins(settings({ enabledPlugins: { 'task-router@koderspa': true } }))

  it('skips what the project already enables', () => {
    expect(pluginsToAdd(state, ['task-router@koderspa', 'caveman@caveman'])).toEqual([
      'caveman@caveman'
    ])
  })

  it('deduplicates a repeated selection', () => {
    expect(pluginsToAdd(state, ['caveman@caveman', 'caveman@caveman'])).toEqual(['caveman@caveman'])
  })
})

describe('marketplacesToDeclare', () => {
  const state = readProjectPlugins(
    settings({
      extraKnownMarketplaces: {
        koderspa: { source: { source: 'github', repo: 'Koder-SpA/claude-mods' } }
      }
    })
  )

  it('adds a name the file does not declare', () => {
    expect(
      marketplacesToDeclare(state, [{ name: 'caveman', repo: 'JuliusBrussee/caveman' }])
    ).toEqual({ add: [{ name: 'caveman', repo: 'JuliusBrussee/caveman' }], collisions: [] })
  })

  it('writes nothing when the file already says exactly this', () => {
    expect(
      marketplacesToDeclare(state, [{ name: 'koderspa', repo: 'Koder-SpA/claude-mods' }])
    ).toEqual({ add: [], collisions: [] })
  })

  it('refuses to repoint a name that already has a different source', () => {
    expect(marketplacesToDeclare(state, [{ name: 'koderspa', repo: 'someone/else' }])).toEqual({
      add: [],
      collisions: ['koderspa']
    })
  })

  it('drops a declaration whose repo is not owner/repo', () => {
    expect(marketplacesToDeclare(state, [{ name: 'x', repo: '/Users/me/x' }]).add).toEqual([])
  })
})

describe('mergeProjectSettings', () => {
  it('creates the file when there is none', () => {
    const merged = JSON.parse(
      mergeProjectSettings(null, {
        plugins: ['caveman@caveman'],
        marketplaces: [{ name: 'caveman', repo: 'JuliusBrussee/caveman' }]
      })
    )
    expect(merged).toEqual({
      extraKnownMarketplaces: {
        caveman: { source: { source: 'github', repo: 'JuliusBrussee/caveman' } }
      },
      enabledPlugins: { 'caveman@caveman': true }
    })
  })

  it('keeps every other key and every existing entry, false included', () => {
    const existing = settings({
      permissions: { deny: ['Bash(rm:*)'] },
      enabledPlugins: { 'task-router@koderspa': true, 'ponytail@ponytail': false }
    })
    const merged = JSON.parse(
      mergeProjectSettings(existing, { plugins: ['caveman@caveman'], marketplaces: [] })
    )
    expect(merged.permissions).toEqual({ deny: ['Bash(rm:*)'] })
    expect(merged.enabledPlugins).toEqual({
      'task-router@koderspa': true,
      'ponytail@ponytail': false,
      'caveman@caveman': true
    })
    expect(merged).not.toHaveProperty('extraKnownMarketplaces')
  })

  it('never removes a plugin, even with nothing to add', () => {
    const existing = settings({ enabledPlugins: { 'task-router@koderspa': true } })
    expect(
      JSON.parse(mergeProjectSettings(existing, { plugins: [], marketplaces: [] })).enabledPlugins
    ).toEqual({ 'task-router@koderspa': true })
  })
})

describe('pluginInstallCommands', () => {
  it('spells out what a clone still has to run, because enabling is not installing', () => {
    expect(pluginInstallCommands(['task-router@koderspa'])).toEqual([
      'claude plugin install task-router@koderspa --scope project'
    ])
  })
})
