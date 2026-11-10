/**
 * Filter the Jira list by who it is assigned to, without writing JQL.
 *
 * The roster is derived from the issues already on screen rather than from
 * Jira's user directory. That keeps the control honest: every avatar shown
 * corresponds to at least one visible issue, so clicking one can never empty
 * the list, and no extra request is made to populate it.
 *
 * The consequence is the one worth stating in the UI: this narrows what is
 * loaded. Someone with issues outside the current query has no avatar here.
 */

import type { JiraIssue } from '../../../../shared/jira/jira-types'

/** Jira treats unassigned as a real bucket, and so does the filter row. */
export const UNASSIGNED_ASSIGNEE_ID = '__unassigned__'

export type JiraAssigneeOption = {
  id: string
  name: string
  avatarUrl?: string
  count: number
}

export function assigneeIdOf(issue: JiraIssue): string {
  return issue.assignee?.accountId || UNASSIGNED_ASSIGNEE_ID
}

export function buildAssigneeOptions(
  issues: readonly JiraIssue[],
  unassignedLabel: string
): JiraAssigneeOption[] {
  const byId = new Map<string, JiraAssigneeOption>()
  for (const issue of issues) {
    const id = assigneeIdOf(issue)
    const existing = byId.get(id)
    if (existing) {
      existing.count += 1
      continue
    }
    byId.set(id, {
      id,
      name: id === UNASSIGNED_ASSIGNEE_ID ? unassignedLabel : (issue.assignee?.displayName ?? id),
      ...(issue.assignee?.avatarUrl ? { avatarUrl: issue.assignee.avatarUrl } : {}),
      count: 1
    })
  }
  return [...byId.values()].sort((left, right) => {
    // Unassigned leads: it is the bucket that needs action, not a teammate.
    if (left.id === UNASSIGNED_ASSIGNEE_ID) {
      return -1
    }
    if (right.id === UNASSIGNED_ASSIGNEE_ID) {
      return 1
    }
    return right.count - left.count || left.name.localeCompare(right.name)
  })
}

/** An empty selection means "everyone", which is what an untouched filter should do. */
export function filterIssuesByAssignee<T extends JiraIssue>(
  issues: readonly T[],
  selected: ReadonlySet<string>
): T[] {
  if (selected.size === 0) {
    return [...issues]
  }
  return issues.filter((issue) => selected.has(assigneeIdOf(issue)))
}

/**
 * Drops ids that no longer match anyone on screen. Without this a selection made
 * before a project switch silently filters the new list down to nothing, and the
 * avatar explaining why is no longer rendered.
 */
export function pruneAssigneeSelection(
  selected: ReadonlySet<string>,
  options: readonly JiraAssigneeOption[]
): Set<string> {
  const available = new Set(options.map((option) => option.id))
  return new Set([...selected].filter((id) => available.has(id)))
}

export function assigneeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''
  return (first + second).toUpperCase()
}
