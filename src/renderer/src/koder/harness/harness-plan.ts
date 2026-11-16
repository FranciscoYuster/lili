/**
 * What the generator would do, decided before it does anything.
 *
 * The rule that shapes this whole module: an existing project already works,
 * and a generator that overwrites a working `AGENTS.md` or a populated
 * `.mcp.json` destroys configuration nobody asked it to touch. So every file is
 * resolved to one of four actions — create what is missing, merge where merging
 * is provably safe, keep what is already right, and refuse the rest by name —
 * and the plan is shown and confirmed before a single byte is written.
 *
 * `merge` is deliberately narrow. It means exactly two things: adding the
 * `@AGENTS.md` import line to a CLAUDE.md that has its own content, and adding
 * MCP servers whose keys are free. Anything else is a `conflict`, which writes
 * nothing and names the file so a human can decide.
 */

import {
  buildAgentsDoc,
  buildClaudeDoc,
  buildDesignDoc,
  buildMcpConfig,
  buildSkillsReadme,
  claudeImportsAgents,
  HARNESS_AGENTS_FILE,
  HARNESS_CLAUDE_FILE,
  HARNESS_DESIGN_FILE,
  HARNESS_MCP_FILE,
  HARNESS_SKILLS_README,
  withClaudeImport,
  type HarnessInputs,
  type HarnessMcpInput
} from './harness-blueprint'
import {
  marketplacesToDeclare,
  mergeProjectSettings,
  pluginsToAdd,
  PROJECT_SETTINGS_FILE,
  readProjectPlugins
} from './harness-project-plugins'

export type HarnessPlanAction = 'create' | 'merge' | 'keep' | 'conflict'

/** Machine tokens, not copy: the panel translates them, so they never carry a language. */
export type HarnessPlanReason =
  | 'absent'
  | 'importAdded'
  | 'alreadyImports'
  | 'exists'
  | 'serversAdded'
  | 'serversTaken'
  | 'unparseable'
  | 'nothingRequested'
  | 'pluginsAdded'
  | 'pluginsAlreadyEnabled'
  | 'marketplaceCollision'

export type HarnessPlanRow = {
  relativePath: string
  action: HarnessPlanAction
  /** The exact bytes to write, or null when this row writes nothing. */
  content: string | null
  reason: HarnessPlanReason
  /** Server keys involved, for the MCP row only. */
  detail?: string[]
}

/** `content: null` means the file is absent, not empty. */
export type ExistingHarnessFile = { relativePath: string; content: string | null }

export function buildHarnessPlan(
  inputs: HarnessInputs,
  existing: readonly ExistingHarnessFile[]
): HarnessPlanRow[] {
  const read = (path: string): string | null =>
    existing.find((file) => file.relativePath === path)?.content ?? null

  return [
    simpleRow(HARNESS_AGENTS_FILE, read(HARNESS_AGENTS_FILE), () => buildAgentsDoc(inputs)),
    claudeRow(read(HARNESS_CLAUDE_FILE)),
    simpleRow(HARNESS_SKILLS_README, read(HARNESS_SKILLS_README), buildSkillsReadme),
    simpleRow(HARNESS_DESIGN_FILE, read(HARNESS_DESIGN_FILE), () => buildDesignDoc(inputs)),
    mcpRow(read(HARNESS_MCP_FILE), inputs.mcp),
    pluginsRow(read(PROJECT_SETTINGS_FILE), inputs)
  ]
}

/**
 * A file we either create or leave alone. There is no safe merge for a document
 * somebody already wrote, so an existing one is reported and never rewritten.
 */
function simpleRow(
  relativePath: string,
  existing: string | null,
  build: () => string
): HarnessPlanRow {
  if (existing === null) {
    return { relativePath, action: 'create', content: build(), reason: 'absent' }
  }
  return { relativePath, action: 'keep', content: null, reason: 'exists' }
}

function claudeRow(existing: string | null): HarnessPlanRow {
  if (existing === null) {
    return {
      relativePath: HARNESS_CLAUDE_FILE,
      action: 'create',
      content: buildClaudeDoc(),
      reason: 'absent'
    }
  }
  if (claudeImportsAgents(existing)) {
    return {
      relativePath: HARNESS_CLAUDE_FILE,
      action: 'keep',
      content: null,
      reason: 'alreadyImports'
    }
  }
  // Prepending is additive: the existing rules survive verbatim below the import.
  return {
    relativePath: HARNESS_CLAUDE_FILE,
    action: 'merge',
    content: withClaudeImport(existing),
    reason: 'importAdded'
  }
}

function mcpRow(existing: string | null, requested: readonly HarnessMcpInput[]): HarnessPlanRow {
  if (requested.length === 0) {
    return {
      relativePath: HARNESS_MCP_FILE,
      action: 'keep',
      content: null,
      reason: 'nothingRequested'
    }
  }
  if (existing === null) {
    return {
      relativePath: HARNESS_MCP_FILE,
      action: 'create',
      content: buildMcpConfig(requested),
      reason: 'absent',
      detail: requested.map((server) => server.name)
    }
  }
  const parsed = parseMcpServers(existing)
  if (!parsed) {
    // Rewriting a file we cannot parse would silently drop whatever is in it.
    return {
      relativePath: HARNESS_MCP_FILE,
      action: 'conflict',
      content: null,
      reason: 'unparseable'
    }
  }
  const taken = requested.filter((server) => server.name in parsed.servers)
  const free = requested.filter((server) => !(server.name in parsed.servers))
  if (free.length === 0) {
    return {
      relativePath: HARNESS_MCP_FILE,
      action: 'keep',
      content: null,
      reason: 'serversTaken',
      detail: taken.map((server) => server.name)
    }
  }
  return {
    relativePath: HARNESS_MCP_FILE,
    action: 'merge',
    content: mergeMcpConfig(parsed.root, parsed.servers, free),
    reason: 'serversAdded',
    detail: free.map((server) => server.name)
  }
}

/**
 * The project's plugin configuration: which marketplaces the repository
 * declares and which plugins it enables, in one write.
 *
 * Additive only, and a marketplace name the file already points somewhere else
 * is a conflict rather than a rewrite: repointing a name silently redirects
 * every plugin installed under it.
 */
function pluginsRow(
  existing: string | null,
  inputs: Pick<HarnessInputs, 'plugins' | 'marketplaces'>
): HarnessPlanRow {
  if (inputs.plugins.length === 0 && inputs.marketplaces.length === 0) {
    return {
      relativePath: PROJECT_SETTINGS_FILE,
      action: 'keep',
      content: null,
      reason: 'nothingRequested'
    }
  }
  const state = readProjectPlugins(existing)
  if (!state.readable) {
    // Same refusal as .mcp.json: rewriting settings we cannot parse would drop
    // permissions, hooks and whatever else the team put in that file.
    return {
      relativePath: PROJECT_SETTINGS_FILE,
      action: 'conflict',
      content: null,
      reason: 'unparseable'
    }
  }
  const marketplaces = marketplacesToDeclare(state, inputs.marketplaces)
  if (marketplaces.collisions.length > 0) {
    return {
      relativePath: PROJECT_SETTINGS_FILE,
      action: 'conflict',
      content: null,
      reason: 'marketplaceCollision',
      detail: marketplaces.collisions
    }
  }
  const plugins = pluginsToAdd(state, inputs.plugins)
  if (plugins.length === 0 && marketplaces.add.length === 0) {
    return {
      relativePath: PROJECT_SETTINGS_FILE,
      action: 'keep',
      content: null,
      reason: 'pluginsAlreadyEnabled',
      detail: [...inputs.plugins]
    }
  }
  return {
    relativePath: PROJECT_SETTINGS_FILE,
    action: state.exists ? 'merge' : 'create',
    content: mergeProjectSettings(existing, { plugins, marketplaces: marketplaces.add }),
    reason: state.exists ? 'pluginsAdded' : 'absent',
    detail: [...plugins, ...marketplaces.add.map((entry) => `${entry.name} (${entry.repo})`)]
  }
}

type ParsedMcp = { root: Record<string, unknown>; servers: Record<string, unknown> }

function parseMcpServers(content: string): ParsedMcp | null {
  if (content.trim() === '') {
    // An empty file is not a configuration anyone wrote; treat it as a blank slate.
    return { root: {}, servers: {} }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  const root = parsed as Record<string, unknown>
  const servers = root.mcpServers
  if (servers === undefined) {
    return { root, servers: {} }
  }
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    return null
  }
  return { root, servers: servers as Record<string, unknown> }
}

/** Keeps every key the file already had, including ones outside `mcpServers`. */
function mergeMcpConfig(
  root: Record<string, unknown>,
  servers: Record<string, unknown>,
  added: readonly HarnessMcpInput[]
): string {
  const addition = JSON.parse(buildMcpConfig(added)) as { mcpServers: Record<string, unknown> }
  return `${JSON.stringify(
    { ...root, mcpServers: { ...servers, ...addition.mcpServers } },
    null,
    2
  )}\n`
}

/** Parent directory of a repo-relative path, or null when it sits at the repo root. */
function parentDirectory(relativePath: string): string | null {
  const cut = relativePath.lastIndexOf('/')
  return cut <= 0 ? null : relativePath.slice(0, cut)
}

/**
 * Directories the writable rows need, shallowest first so a parent is created
 * before its child. The host's `createDir` is recursive, but ordering keeps the
 * failure of a deep path from reading as the failure of its parent.
 */
export function requiredHarnessDirectories(rows: readonly HarnessPlanRow[]): string[] {
  const directories = new Set<string>()
  for (const row of writableHarnessRows(rows)) {
    const parent = parentDirectory(row.relativePath)
    if (parent) {
      directories.add(parent)
    }
  }
  // Depth, not string length: 'docs/design' is not a parent of '.agents/skills'
  // just because it is shorter, and a stable order keeps the plan reproducible.
  const depth = (path: string): number => path.split('/').length
  return [...directories].sort(
    (left, right) => depth(left) - depth(right) || left.localeCompare(right)
  )
}

/** Rows that will actually touch the disk, in the order they should be written. */
export function writableHarnessRows(rows: readonly HarnessPlanRow[]): HarnessPlanRow[] {
  return rows.filter((row) => row.content !== null)
}

export function countHarnessWrites(rows: readonly HarnessPlanRow[]): number {
  return writableHarnessRows(rows).length
}
