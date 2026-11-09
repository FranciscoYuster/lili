/**
 * What each workspace's agent is doing right now, keyed by workspace.
 *
 * The sidebar already derives this per card through a hook, which works when
 * one card asks for itself. The canvas asks for all of them at once, so it
 * needs the whole map in a single pass over the status table instead of a hook
 * per tile.
 *
 * Status entries are keyed by pane, and one workspace can hold several panes:
 * a terminal, a chat, a subagent. The strongest unfinished state wins, because
 * a tile exists to answer "does this need me", and an agent blocked on a
 * permission prompt needs you whether or not its sibling pane is idle.
 */

import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { resolveAgentStatusWorktreeId } from '../../../shared/agent-status/identity/agent-status-worktree-attribution'

/** Mirrors the sidebar's own cutoff: an unrefreshed row is unknown, not finished. */
export const LIVE_STATUS_STALE_AFTER_MS = 60_000

export type CanvasLiveState = 'permission' | 'working' | 'monitoring' | 'blocked' | 'done' | 'idle'

export type CanvasLiveInfo = {
  state: CanvasLiveState
  /** The agent's own last words, or the prompt it is answering; empty when neither is known. */
  text: string
  /** True when `text` is tool output rather than prose, so the tile can mark it. */
  isToolOutput: boolean
  model: string | null
  toolName: string | null
  updatedAt: number
}

type StatusEntry = AgentStatusEntry & {
  lastAssistantMessage?: string
  lastAssistantMessageIsToolOutput?: boolean | null
}

type TabsByWorktree = Record<string, readonly { id: string }[]> | null | undefined

/** Higher wins a collision between panes of the same workspace. */
const STATE_RANK: Record<CanvasLiveState, number> = {
  permission: 5,
  blocked: 4,
  working: 3,
  monitoring: 2,
  done: 1,
  idle: 0
}

function stateOf(entry: StatusEntry): CanvasLiveState {
  switch (entry.state) {
    case 'waiting':
      // Waiting is the agent holding a question in front of you; nothing moves until you answer.
      return 'permission'
    case 'blocked':
      return 'blocked'
    case 'working':
      return entry.workingMode === 'monitoring' ? 'monitoring' : 'working'
    case 'done':
      return 'done'
    default:
      return 'idle'
  }
}

function textOf(entry: StatusEntry): { text: string; isToolOutput: boolean } {
  const assistant = entry.lastAssistantMessage?.trim()
  if (assistant) {
    return { text: assistant, isToolOutput: entry.lastAssistantMessageIsToolOutput === true }
  }
  // No reply yet means the turn just started; the prompt is the honest stand-in.
  return { text: entry.prompt?.trim() ?? '', isToolOutput: false }
}

export function buildLiveByWorktree(
  agentStatusByPaneKey: Record<string, AgentStatusEntry> | null | undefined,
  tabsByWorktree: TabsByWorktree,
  now: number = Date.now()
): Map<string, CanvasLiveInfo> {
  const worktreeIdByTabId = new Map<string, string>()
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree ?? {})) {
    for (const tab of tabs) {
      worktreeIdByTabId.set(tab.id, worktreeId)
    }
  }

  const result = new Map<string, CanvasLiveInfo>()
  for (const entry of Object.values(agentStatusByPaneKey ?? {}) as StatusEntry[]) {
    // A stale row is evidence of nothing: show the tile as idle rather than claim work.
    if (now - entry.updatedAt > LIVE_STATUS_STALE_AFTER_MS && entry.state !== 'done') {
      continue
    }
    const worktreeId = resolveAgentStatusWorktreeId(entry, worktreeIdByTabId)
    if (!worktreeId) {
      continue
    }
    const state = stateOf(entry)
    const existing = result.get(worktreeId)
    if (existing && STATE_RANK[existing.state] > STATE_RANK[state]) {
      continue
    }
    // Same strength: the more recent pane describes the workspace better.
    if (
      existing &&
      STATE_RANK[existing.state] === STATE_RANK[state] &&
      existing.updatedAt >= entry.updatedAt
    ) {
      continue
    }
    const { text, isToolOutput } = textOf(entry)
    result.set(worktreeId, {
      state,
      text,
      isToolOutput,
      model: entry.model ?? null,
      toolName: entry.toolName ?? null,
      updatedAt: entry.updatedAt
    })
  }
  return result
}

/** One line, collapsed whitespace, cut on a word where possible. */
export function liveSummaryLine(text: string, maxLength = 180): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) {
    return collapsed
  }
  const cut = collapsed.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}
