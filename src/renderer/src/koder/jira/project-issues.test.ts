import { describe, expect, it } from 'vitest'
import type { JiraIssue } from '../../../../shared/jira/jira-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  buildProjectIssueRows,
  buildProjectIssuesJql,
  countLinkedRows,
  projectLabel,
  sortProjectIssueRows
} from './project-issues'

function issue(key: string): JiraIssue {
  return {
    id: key,
    key,
    title: key,
    url: `https://koder.atlassian.net/browse/${key}`,
    project: { id: '1', key: 'DILER', name: 'diler' },
    issueType: { id: '1', name: 'Story' },
    status: { id: '1', name: 'To Do' } as JiraIssue['status'],
    labels: [],
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z'
  }
}

function workspace(id: string): Worktree {
  return { id, displayName: id, lastActivityAt: 0 } as Worktree
}

describe('buildProjectIssuesJql', () => {
  it('builds a scoped, ordered query for a normal key', () => {
    expect(buildProjectIssuesJql('DILER')).toBe('project = "DILER" ORDER BY updated DESC')
  })

  it('refuses anything that is not a Jira project key rather than quoting it', () => {
    // A key is the only value interpolated into this string, so it is validated
    // instead of escaped: a value failing this test did not come from Jira.
    expect(buildProjectIssuesJql('DILER" OR project = "PM')).toBeNull()
    expect(buildProjectIssuesJql('')).toBeNull()
    expect(buildProjectIssuesJql('  ')).toBeNull()
    expect(buildProjectIssuesJql('9LIVES')).toBeNull()
  })

  it('trims surrounding whitespace before validating', () => {
    expect(buildProjectIssuesJql('  PM  ')).toBe('project = "PM" ORDER BY updated DESC')
  })
})

describe('buildProjectIssueRows', () => {
  it('marks the row whose workspace is the one currently open', () => {
    const rows = buildProjectIssueRows(
      [issue('DILER-1'), issue('DILER-2')],
      (candidate) => (candidate.key === 'DILER-2' ? [workspace('w9')] : []),
      'w9'
    )
    expect(rows[0]?.isActiveWorkspace).toBe(false)
    expect(rows[1]?.isActiveWorkspace).toBe(true)
  })

  it('treats no active workspace as nothing being highlighted', () => {
    const rows = buildProjectIssueRows([issue('DILER-1')], () => [workspace('w1')], null)
    expect(rows[0]?.isActiveWorkspace).toBe(false)
    expect(rows[0]?.workspaces).toHaveLength(1)
  })
})

describe('sortProjectIssueRows', () => {
  it('puts the open workspace first, then anything else with a workspace', () => {
    const rows = buildProjectIssueRows(
      [issue('A-1'), issue('A-2'), issue('A-3')],
      (candidate) =>
        candidate.key === 'A-2'
          ? [workspace('w1')]
          : candidate.key === 'A-3'
            ? [workspace('w9')]
            : [],
      'w9'
    )
    expect(sortProjectIssueRows(rows).map((row) => row.issue.key)).toEqual(['A-3', 'A-2', 'A-1'])
  })

  it('leaves Jira’s own order alone when nothing is linked', () => {
    const rows = buildProjectIssueRows([issue('A-1'), issue('A-2')], () => [], null)
    expect(sortProjectIssueRows(rows).map((row) => row.issue.key)).toEqual(['A-1', 'A-2'])
  })
})

describe('countLinkedRows and projectLabel', () => {
  it('counts only rows that have a workspace', () => {
    const rows = buildProjectIssueRows(
      [issue('A-1'), issue('A-2')],
      (candidate) => (candidate.key === 'A-1' ? [workspace('w1')] : []),
      null
    )
    expect(countLinkedRows(rows)).toBe(1)
  })

  it('does not repeat the key when the project is named after it', () => {
    expect(projectLabel({ id: '1', key: 'DILER', name: 'diler', siteId: 's' })).toBe(
      'DILER · diler'
    )
    expect(projectLabel({ id: '1', key: 'PM', name: 'PM', siteId: 's' })).toBe('PM')
  })
})
