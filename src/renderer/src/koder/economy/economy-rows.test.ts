import { describe, expect, it } from 'vitest'
import {
  cacheReuseRate,
  economyByAgent,
  economyByWorkspace,
  economyForWorktree,
  readClaudeEconomyRows,
  readTotalShapedEconomyRows,
  sumEconomy,
  unattributedEconomy
} from './economy-rows'

const claudeRow = {
  key: 'worktree:w1',
  label: 'flotta FLTT-12',
  sessions: 2,
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 600,
  cacheWriteTokens: 250,
  estimatedCostUsd: 1.5
}

describe('readClaudeEconomyRows', () => {
  it('sums the four disjoint buckets Claude reports', () => {
    const [row] = readClaudeEconomyRows([claudeRow])
    expect(row.tokens).toBe(1000)
    expect(row.worktreeId).toBe('w1')
    expect(row.costUsd).toBe(1.5)
  })
})

describe('readTotalShapedEconomyRows', () => {
  it('reads totalTokens instead of summing, because cached and reasoning are subsets', () => {
    const [row] = readTotalShapedEconomyRows('codex', [
      {
        key: 'worktree:w1',
        label: 'flotta FLTT-12',
        sessions: 1,
        totalTokens: 400,
        cachedInputTokens: 300,
        estimatedCostUsd: 0.4
      }
    ])
    // Summing input + cachedInput + output + reasoningOutput would double-count.
    expect(row.tokens).toBe(400)
    expect(row.cachedTokens).toBe(300)
  })

  it('treats a missing price field as unpriced rather than free', () => {
    const [row] = readTotalShapedEconomyRows('muse', [
      { key: 'worktree:w1', label: 'x', sessions: 1, totalTokens: 10, cachedInputTokens: 0 }
    ])
    expect(row.costUsd).toBeNull()
  })
})

describe('sumEconomy', () => {
  it('flags an undercount only when an unpriced row carried tokens', () => {
    const priced = readClaudeEconomyRows([claudeRow])
    const unpriced = readTotalShapedEconomyRows('muse', [
      { key: 'worktree:w1', label: 'x', sessions: 1, totalTokens: 10, cachedInputTokens: 0 }
    ])
    expect(sumEconomy(priced).hasUnpricedAgent).toBe(false)
    const mixed = sumEconomy([...priced, ...unpriced])
    expect(mixed.hasUnpricedAgent).toBe(true)
    expect(mixed.tokens).toBe(1010)
    expect(mixed.costUsd).toBe(1.5)
  })

  it('leaves an empty scope at zero rather than null', () => {
    expect(sumEconomy([])).toEqual({
      tokens: 0,
      costUsd: 0,
      hasUnpricedAgent: false,
      cachedTokens: 0,
      sessions: 0
    })
  })
})

describe('scoping', () => {
  const rows = [
    ...readClaudeEconomyRows([claudeRow, { ...claudeRow, key: 'worktree:w2', label: 'diler' }]),
    ...readClaudeEconomyRows([
      { ...claudeRow, key: 'cwd:/Users/x/scratch', label: '/Users/x/scratch' },
      { ...claudeRow, key: 'unscoped', label: 'unscoped' }
    ])
  ]

  it('keeps one workspace separate from the rest', () => {
    expect(economyForWorktree(rows, 'w1')).toHaveLength(1)
  })

  it('reports spend outside every workspace instead of smearing it', () => {
    const unplaced = unattributedEconomy(rows)
    expect(unplaced).toHaveLength(2)
    expect(sumEconomy(unplaced).tokens).toBe(2000)
  })

  it('ranks workspaces by tokens and drops the unplaceable rows', () => {
    const byWorkspace = economyByWorkspace(rows)
    expect(byWorkspace.map((entry) => entry.worktreeId)).toEqual(['w1', 'w2'])
  })
})

describe('economyByAgent', () => {
  it('omits agents with no recorded tokens', () => {
    const rows = [
      ...readClaudeEconomyRows([claudeRow]),
      ...readTotalShapedEconomyRows('codex', [
        { key: 'worktree:w1', label: 'x', sessions: 0, totalTokens: 0, cachedInputTokens: 0 }
      ])
    ]
    expect(economyByAgent(rows).map((entry) => entry.agent)).toEqual(['claude'])
  })
})

describe('cacheReuseRate', () => {
  it('is null with no tokens, so the UI can say "—" instead of 0%', () => {
    expect(cacheReuseRate(sumEconomy([]))).toBeNull()
    expect(cacheReuseRate(sumEconomy(readClaudeEconomyRows([claudeRow])))).toBeCloseTo(0.6)
  })
})
