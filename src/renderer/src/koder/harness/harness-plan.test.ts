import { describe, expect, it } from 'vitest'
import {
  buildHarnessPlan,
  countHarnessWrites,
  requiredHarnessDirectories,
  writableHarnessRows,
  type ExistingHarnessFile
} from './harness-plan'
import {
  buildMcpConfig,
  claudeImportsAgents,
  HARNESS_AGENTS_FILE,
  HARNESS_CLAUDE_FILE,
  HARNESS_DESIGN_FILE,
  HARNESS_MCP_FILE,
  HARNESS_SKILLS_README,
  type HarnessInputs
} from './harness-blueprint'

const mongo = {
  name: 'mongodb',
  command: 'npx',
  args: ['-y', 'mongodb-mcp-server'],
  env: [{ key: 'MDB_MCP_CONNECTION_STRING', variable: 'MONGODB_URI' }]
}

const inputs = (over: Partial<HarnessInputs> = {}): HarnessInputs => ({
  projectName: 'backoffice',
  summary: 'Internal operations for Koder.',
  stack: 'Next.js 16 · MongoDB',
  mcp: [mongo],
  ...over
})

const row = (plan: ReturnType<typeof buildHarnessPlan>, path: string) => {
  const found = plan.find((entry) => entry.relativePath === path)
  if (!found) {
    throw new Error(`no plan row for ${path}`)
  }
  return found
}

const absent: ExistingHarnessFile[] = []

describe('buildHarnessPlan on an empty project', () => {
  it('creates every file', () => {
    const plan = buildHarnessPlan(inputs(), absent)
    expect(plan.map((entry) => entry.action)).toEqual([
      'create',
      'create',
      'create',
      'create',
      'create'
    ])
    expect(countHarnessWrites(plan)).toBe(5)
  })

  it('writes CLAUDE.md as the import and nothing else', () => {
    const claude = row(buildHarnessPlan(inputs(), absent), HARNESS_CLAUDE_FILE)
    expect(claude.content).toBe('@AGENTS.md\n')
  })

  it('puts the variable reference in .mcp.json, never a value', () => {
    const mcp = row(buildHarnessPlan(inputs(), absent), HARNESS_MCP_FILE)
    expect(mcp.content).toContain('"MDB_MCP_CONNECTION_STRING": "${MONGODB_URI}"')
    expect(mcp.content).not.toContain('mongodb+srv')
  })
})

describe('buildHarnessPlan on a project that already has files', () => {
  it('never rewrites an existing AGENTS.md', () => {
    const plan = buildHarnessPlan(inputs(), [
      { relativePath: HARNESS_AGENTS_FILE, content: '# mine\n' }
    ])
    const agents = row(plan, HARNESS_AGENTS_FILE)
    expect(agents.action).toBe('keep')
    expect(agents.content).toBeNull()
  })

  it('adds the import to a CLAUDE.md with its own rules, keeping them', () => {
    const existing = '# Rules\n\nAlways run the tests.\n'
    const claude = row(
      buildHarnessPlan(inputs(), [{ relativePath: HARNESS_CLAUDE_FILE, content: existing }]),
      HARNESS_CLAUDE_FILE
    )
    expect(claude.action).toBe('merge')
    expect(claude.content).toContain('Always run the tests.')
    expect(claudeImportsAgents(claude.content ?? '')).toBe(true)
  })

  it('leaves a CLAUDE.md that already imports AGENTS.md alone', () => {
    const claude = row(
      buildHarnessPlan(inputs(), [
        { relativePath: HARNESS_CLAUDE_FILE, content: '@AGENTS.md\n\n# extra\n' }
      ]),
      HARNESS_CLAUDE_FILE
    )
    expect(claude.action).toBe('keep')
    expect(claude.reason).toBe('alreadyImports')
  })

  it('does not count a mention of AGENTS.md inside prose as the import', () => {
    const claude = row(
      buildHarnessPlan(inputs(), [
        { relativePath: HARNESS_CLAUDE_FILE, content: 'See @AGENTS.md for the rules.\n' }
      ]),
      HARNESS_CLAUDE_FILE
    )
    expect(claude.action).toBe('merge')
  })

  it('adds only the free MCP keys and keeps the rest of the file', () => {
    const existing = JSON.stringify(
      { mcpServers: { postgres: { command: 'npx', args: [] } }, other: true },
      null,
      2
    )
    const plan = buildHarnessPlan(inputs({ mcp: [mongo, { ...mongo, name: 'postgres' }] }), [
      { relativePath: HARNESS_MCP_FILE, content: existing }
    ])
    const mcp = row(plan, HARNESS_MCP_FILE)
    expect(mcp.action).toBe('merge')
    expect(mcp.detail).toEqual(['mongodb'])
    const written = JSON.parse(mcp.content ?? '{}')
    expect(Object.keys(written.mcpServers).sort()).toEqual(['mongodb', 'postgres'])
    // The key that was taken keeps its original definition, not ours.
    expect(written.mcpServers.postgres).toEqual({ command: 'npx', args: [] })
    expect(written.other).toBe(true)
  })

  it('keeps .mcp.json untouched when every requested key is taken', () => {
    const mcp = row(
      buildHarnessPlan(inputs(), [
        {
          relativePath: HARNESS_MCP_FILE,
          content: JSON.stringify({ mcpServers: { mongodb: {} } })
        }
      ]),
      HARNESS_MCP_FILE
    )
    expect(mcp.action).toBe('keep')
    expect(mcp.reason).toBe('serversTaken')
  })

  it('refuses an unparseable .mcp.json instead of replacing it', () => {
    const mcp = row(
      buildHarnessPlan(inputs(), [{ relativePath: HARNESS_MCP_FILE, content: '{ broken' }]),
      HARNESS_MCP_FILE
    )
    expect(mcp.action).toBe('conflict')
    expect(mcp.content).toBeNull()
  })

  it('treats an empty .mcp.json as a blank slate, not as a conflict', () => {
    const mcp = row(
      buildHarnessPlan(inputs(), [{ relativePath: HARNESS_MCP_FILE, content: '   \n' }]),
      HARNESS_MCP_FILE
    )
    expect(mcp.action).toBe('merge')
    expect(mcp.detail).toEqual(['mongodb'])
  })

  it('writes no MCP file when no server was requested', () => {
    const mcp = row(buildHarnessPlan(inputs({ mcp: [] }), absent), HARNESS_MCP_FILE)
    expect(mcp.action).toBe('keep')
    expect(mcp.reason).toBe('nothingRequested')
  })

  it('writes nothing at all on a project that already has the whole harness', () => {
    const plan = buildHarnessPlan(inputs({ mcp: [] }), [
      { relativePath: HARNESS_AGENTS_FILE, content: '#\n' },
      { relativePath: HARNESS_CLAUDE_FILE, content: '@AGENTS.md\n' },
      { relativePath: HARNESS_SKILLS_README, content: '#\n' },
      { relativePath: HARNESS_DESIGN_FILE, content: '#\n' }
    ])
    expect(writableHarnessRows(plan)).toEqual([])
  })
})

describe('buildMcpConfig', () => {
  it('omits env entirely when a server needs none', () => {
    const config = JSON.parse(buildMcpConfig([{ ...mongo, env: [] }]))
    expect(config.mcpServers.mongodb).not.toHaveProperty('env')
  })
})

describe('requiredHarnessDirectories', () => {
  it('ignores root-level files and returns each parent once, shallowest first', () => {
    const plan = buildHarnessPlan(inputs(), absent)
    expect(requiredHarnessDirectories(plan)).toEqual(['.agents/skills', 'docs/design'])
  })

  it('skips rows that write nothing', () => {
    const plan = buildHarnessPlan(inputs({ mcp: [] }), [
      { relativePath: HARNESS_DESIGN_FILE, content: '#\n' },
      { relativePath: HARNESS_SKILLS_README, content: '#\n' }
    ])
    expect(requiredHarnessDirectories(plan)).toEqual([])
  })
})
