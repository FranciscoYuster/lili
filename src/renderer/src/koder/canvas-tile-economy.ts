/**
 * What each workspace has cost, keyed by workspace.
 *
 * Orca already attributes Claude's token log to a worktree — the scanner walks
 * every turn's cwd, resolves the containing worktree and keys the row
 * `worktree:<id>` — and already prices it. It then shows the result only in a
 * stats pane nobody opens while working. This module is the join that puts it
 * on the thing you are looking at.
 *
 * The cost is an estimate from published per-model rates applied to logged
 * tokens, not an invoice: a subscription bills nothing per token, and a model
 * with no pricing entry contributes tokens but no dollars. The UI says
 * "estimado" for that reason.
 */

export type CanvasEconomy = {
  /** Input + output + cache read + cache write, as logged. */
  totalTokens: number
  /** Null when every row for this workspace used a model with no published price. */
  estimatedCostUsd: number | null
  turns: number
}

type BreakdownRow = {
  key: string
  totalTokensFromRow?: never
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  estimatedCostUsd: number | null
  turns: number
}

const WORKTREE_KEY_PREFIX = 'worktree:'

/**
 * Rows keyed by anything else — `cwd:<path>` for work outside a registered
 * workspace, `unscoped` for turns with no cwd at all — are real spend that this
 * view cannot place, so they are dropped here and counted by the caller rather
 * than smeared across the tiles that happen to exist.
 */
export function buildEconomyByWorktree(
  projectBreakdown: readonly BreakdownRow[] | null | undefined
): Map<string, CanvasEconomy> {
  const result = new Map<string, CanvasEconomy>()
  for (const row of projectBreakdown ?? []) {
    if (!row.key.startsWith(WORKTREE_KEY_PREFIX)) {
      continue
    }
    result.set(row.key.slice(WORKTREE_KEY_PREFIX.length), {
      totalTokens: row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens,
      estimatedCostUsd: row.estimatedCostUsd,
      turns: row.turns
    })
  }
  return result
}

export function unattributedSpend(projectBreakdown: readonly BreakdownRow[] | null | undefined): {
  tokens: number
  costUsd: number
} {
  let tokens = 0
  let costUsd = 0
  for (const row of projectBreakdown ?? []) {
    if (row.key.startsWith(WORKTREE_KEY_PREFIX)) {
      continue
    }
    tokens += row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
    costUsd += row.estimatedCostUsd ?? 0
  }
  return { tokens, costUsd }
}

export function formatTokens(total: number): string {
  if (total >= 1_000_000_000) {
    return `${(total / 1_000_000_000).toFixed(1)}B`
  }
  if (total >= 1_000_000) {
    return `${(total / 1_000_000).toFixed(1)}M`
  }
  if (total >= 1_000) {
    return `${Math.round(total / 1_000)}k`
  }
  return String(total)
}

/** Sub-cent spend reads as 0.00 and looks like a bug, so it gets its own form. */
export function formatCostUsd(cost: number | null): string | null {
  if (cost === null) {
    return null
  }
  if (cost > 0 && cost < 0.01) {
    return '<0,01'
  }
  return cost.toFixed(2)
}
