/**
 * The Jira issues for the repository you are standing in.
 *
 * The binding already exists: a repo carries `defaultJiraProject`, which names
 * a site and a project key. What has never existed is the reverse view — open a
 * repo and see its board, with the workspace each issue is already being worked
 * in. That link is the one thing the Tasks page cannot show you from here.
 */

import type { JiraIssue } from '../../../../shared/jira/jira-types'
import type { JiraProjectReference } from '../../../../shared/jira/jira-project-reference'
import type { Worktree } from '../../../../shared/worktree/types'

/**
 * Jira project keys are uppercase alphanumerics with underscores. Anything else
 * reaching the JQL string is either a bug or a value that did not come from
 * Jira, and quoting it would be guessing at the intent — so it is refused.
 */
const PROJECT_KEY = /^[A-Za-z][A-Za-z0-9_]*$/

export function buildProjectIssuesJql(projectKey: string): string | null {
  const key = projectKey.trim()
  if (!PROJECT_KEY.test(key)) {
    return null
  }
  return `project = "${key}" ORDER BY updated DESC`
}

export type ProjectIssueRow = {
  issue: JiraIssue
  /** Workspaces already attached to this issue, most recently active first. */
  workspaces: readonly Worktree[]
  /** True when one of those workspaces is the one currently open. */
  isActiveWorkspace: boolean
}

export function buildProjectIssueRows(
  issues: readonly JiraIssue[],
  findWorkspaces: (issue: JiraIssue) => readonly Worktree[],
  activeWorktreeId: string | null
): ProjectIssueRow[] {
  return issues.map((issue) => {
    const workspaces = findWorkspaces(issue)
    return {
      issue,
      workspaces,
      isActiveWorkspace:
        activeWorktreeId !== null &&
        workspaces.some((workspace) => workspace.id === activeWorktreeId)
    }
  })
}

/**
 * Issues with a workspace first: those are the ones in flight, and the question
 * this panel answers from a repo is "what is already being worked on here".
 * Jira's own `updated DESC` decides the rest.
 */
export function sortProjectIssueRows(rows: readonly ProjectIssueRow[]): ProjectIssueRow[] {
  return [...rows].sort((left, right) => {
    if (left.isActiveWorkspace !== right.isActiveWorkspace) {
      return left.isActiveWorkspace ? -1 : 1
    }
    const leftLinked = left.workspaces.length > 0
    const rightLinked = right.workspaces.length > 0
    if (leftLinked !== rightLinked) {
      return leftLinked ? -1 : 1
    }
    return 0
  })
}

export function projectLabel(project: JiraProjectReference): string {
  return project.name.trim() === project.key.trim()
    ? project.key
    : `${project.key} · ${project.name}`
}

/** Jira is paged; a full count is a separate request this panel does not make. */
export function countLinkedRows(rows: readonly ProjectIssueRow[]): number {
  return rows.filter((row) => row.workspaces.length > 0).length
}
