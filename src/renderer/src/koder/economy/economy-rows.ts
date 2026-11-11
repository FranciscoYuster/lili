/**
 * What the agents have cost, per workspace, across every agent 信心 can read.
 *
 * Four scanners feed this — Claude, Codex, OpenCode and Muse — and all four key
 * their project rows the same way, `worktree:<id>`, through one shared
 * attribution step (`src/main/usage/usage-event-attribution.ts`). That shared
 * key is the whole reason a single panel can add them up: the join is exact, not
 * a name match.
 *
 * Two things they do NOT share, and both change the arithmetic:
 *
 * 1. Token shape. Claude reports four disjoint buckets that sum to the total.
 *    The other three report `totalTokens` plus `cachedInputTokens` and
 *    `reasoningOutputTokens`, which are SUBSETS of input and output — summing
 *    those four double-counts, so this module reads their `totalTokens`.
 * 2. Pricing. Muse rows carry no cost field at all, so Muse contributes tokens
 *    and never dollars. Reporting its spend as 0 would read as free; the panel
 *    says "sin tarifa" instead.
 */

export type EconomyAgent = 'claude' | 'codex' | 'opencode' | 'muse'

export const ECONOMY_AGENT_LABEL: Record<EconomyAgent, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  muse: 'Muse'
}

export type EconomyRow = {
  agent: EconomyAgent
  /** Null for spend this view cannot place: `cwd:<path>` and `unscoped` rows. */
  worktreeId: string | null
  label: string
  tokens: number
  /** Null when the agent publishes no price for the row at all (Muse). */
  costUsd: number | null
  cachedTokens: number
  sessions: number
}

export type EconomyTotals = {
  tokens: number
  costUsd: number
  /** True when at least one contributing agent reports tokens but no price. */
  hasUnpricedAgent: boolean
  cachedTokens: number
  sessions: number
}

type ClaudeShapedRow = {
  key: string
  label: string
  sessions: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number | null
}

type TotalShapedRow = {
  key: string
  label: string
  sessions: number
  totalTokens: number
  cachedInputTokens: number
  estimatedCostUsd?: number | null
}

const WORKTREE_KEY_PREFIX = 'worktree:'

function worktreeIdFromKey(key: string): string | null {
  return key.startsWith(WORKTREE_KEY_PREFIX) ? key.slice(WORKTREE_KEY_PREFIX.length) : null
}

export function readClaudeEconomyRows(
  rows: readonly ClaudeShapedRow[] | null | undefined
): EconomyRow[] {
  return (rows ?? []).map((row) => ({
    agent: 'claude' as const,
    worktreeId: worktreeIdFromKey(row.key),
    label: row.label,
    tokens: row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens,
    costUsd: row.estimatedCostUsd,
    cachedTokens: row.cacheReadTokens,
    sessions: row.sessions
  }))
}

/**
 * Codex, OpenCode and Muse. `cachedInputTokens` is reported as a subset of the
 * input it already counted, so it is carried for the reuse ratio only and never
 * added to the total.
 */
export function readTotalShapedEconomyRows(
  agent: Exclude<EconomyAgent, 'claude'>,
  rows: readonly TotalShapedRow[] | null | undefined
): EconomyRow[] {
  return (rows ?? []).map((row) => ({
    agent,
    worktreeId: worktreeIdFromKey(row.key),
    label: row.label,
    tokens: row.totalTokens,
    costUsd: row.estimatedCostUsd ?? null,
    cachedTokens: row.cachedInputTokens,
    sessions: row.sessions
  }))
}

const EMPTY_TOTALS: EconomyTotals = {
  tokens: 0,
  costUsd: 0,
  hasUnpricedAgent: false,
  cachedTokens: 0,
  sessions: 0
}

export function sumEconomy(rows: readonly EconomyRow[]): EconomyTotals {
  let totals = EMPTY_TOTALS
  for (const row of rows) {
    totals = {
      tokens: totals.tokens + row.tokens,
      costUsd: totals.costUsd + (row.costUsd ?? 0),
      // A row with tokens and no price is the only thing that makes the dollar
      // figure an undercount, so that is exactly what this flag tracks.
      hasUnpricedAgent: totals.hasUnpricedAgent || (row.costUsd === null && row.tokens > 0),
      cachedTokens: totals.cachedTokens + row.cachedTokens,
      sessions: totals.sessions + row.sessions
    }
  }
  return totals
}

export function economyForWorktree(rows: readonly EconomyRow[], worktreeId: string): EconomyRow[] {
  return rows.filter((row) => row.worktreeId === worktreeId)
}

/** Rows this view can place on a workspace; the rest are reported separately. */
export function attributedEconomy(rows: readonly EconomyRow[]): EconomyRow[] {
  return rows.filter((row) => row.worktreeId !== null)
}

export function unattributedEconomy(rows: readonly EconomyRow[]): EconomyRow[] {
  return rows.filter((row) => row.worktreeId === null)
}

export function economyByAgent(rows: readonly EconomyRow[]): {
  agent: EconomyAgent
  totals: EconomyTotals
}[] {
  const order: EconomyAgent[] = ['claude', 'codex', 'opencode', 'muse']
  return order
    .map((agent) => ({ agent, totals: sumEconomy(rows.filter((row) => row.agent === agent)) }))
    .filter((entry) => entry.totals.tokens > 0)
    .sort((left, right) => right.totals.tokens - left.totals.tokens)
}

export type EconomyWorkspaceEntry = {
  worktreeId: string
  label: string
  totals: EconomyTotals
}

/**
 * One entry per workspace, costliest first. The label comes from the row rather
 * than the live workspace list on purpose: a deleted worktree's spend still
 * happened, and its name is the only thing left that identifies it.
 */
export function economyByWorkspace(rows: readonly EconomyRow[]): EconomyWorkspaceEntry[] {
  const grouped = new Map<string, { label: string; rows: EconomyRow[] }>()
  for (const row of attributedEconomy(rows)) {
    const id = row.worktreeId as string
    const existing = grouped.get(id)
    if (existing) {
      existing.rows.push(row)
    } else {
      grouped.set(id, { label: row.label, rows: [row] })
    }
  }
  return [...grouped.entries()]
    .map(([worktreeId, group]) => ({
      worktreeId,
      label: group.label,
      totals: sumEconomy(group.rows)
    }))
    .sort((left, right) => right.totals.tokens - left.totals.tokens)
}

/**
 * Share of input that came from cache. Reported against total tokens because
 * that is the only denominator every agent shape agrees on.
 */
export function cacheReuseRate(totals: EconomyTotals): number | null {
  return totals.tokens > 0 ? totals.cachedTokens / totals.tokens : null
}
