import { describe, expect, it } from 'vitest'
import type { JiraIssue, JiraUser } from '../../../../shared/jira/jira-types'
import {
  assigneeInitials,
  buildAssigneeOptions,
  filterIssuesByAssignee,
  pruneAssigneeSelection,
  UNASSIGNED_ASSIGNEE_ID
} from './assignee-filter'

function issue(key: string, assignee?: JiraUser): JiraIssue {
  return {
    id: key,
    key,
    title: key,
    url: `https://example.atlassian.net/browse/${key}`,
    project: { id: '1', key: 'DILER', name: 'diler' },
    issueType: { id: '1', name: 'Story' },
    status: { id: '1', name: 'To Do' } as JiraIssue['status'],
    labels: [],
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
    ...(assignee ? { assignee } : {})
  }
}

const linda: JiraUser = { accountId: 'acc-linda', displayName: 'Linda Diaz' }
const francisco: JiraUser = { accountId: 'acc-fran', displayName: 'Francisco Yuster' }

describe('buildAssigneeOptions', () => {
  const rows = [issue('D-1', francisco), issue('D-2', francisco), issue('D-3', linda), issue('D-4')]

  it('counts each person once and leads with unassigned', () => {
    const options = buildAssigneeOptions(rows, 'Sin asignar')
    expect(options.map((option) => option.id)).toEqual([
      UNASSIGNED_ASSIGNEE_ID,
      'acc-fran',
      'acc-linda'
    ])
    expect(options[1]?.count).toBe(2)
  })

  it('orders teammates by how much they are carrying', () => {
    const options = buildAssigneeOptions([issue('D-3', linda), ...rows], 'Sin asignar')
    expect(options[1]?.id).toBe('acc-fran')
    expect(options[1]?.count).toBe(2)
    expect(options[2]?.count).toBe(2)
  })

  it('produces nothing for an empty list, so the row can hide itself', () => {
    expect(buildAssigneeOptions([], 'Sin asignar')).toEqual([])
  })
})

describe('filterIssuesByAssignee', () => {
  const rows = [issue('D-1', francisco), issue('D-3', linda), issue('D-4')]

  it('treats an untouched filter as everyone', () => {
    expect(filterIssuesByAssignee(rows, new Set())).toHaveLength(3)
  })

  it('keeps only the selected people', () => {
    const filtered = filterIssuesByAssignee(rows, new Set(['acc-linda']))
    expect(filtered.map((row) => row.key)).toEqual(['D-3'])
  })

  it('treats unassigned as a selectable bucket', () => {
    const filtered = filterIssuesByAssignee(rows, new Set([UNASSIGNED_ASSIGNEE_ID]))
    expect(filtered.map((row) => row.key)).toEqual(['D-4'])
  })
})

describe('pruneAssigneeSelection', () => {
  it('drops a person who is no longer on screen, so the list cannot go blank silently', () => {
    const options = buildAssigneeOptions([issue('D-1', francisco)], 'Sin asignar')
    const pruned = pruneAssigneeSelection(new Set(['acc-linda', 'acc-fran']), options)
    expect([...pruned]).toEqual(['acc-fran'])
  })
})

describe('assigneeInitials', () => {
  it('takes first and last initials, and never renders empty', () => {
    expect(assigneeInitials('Francisco Yuster')).toBe('FY')
    expect(assigneeInitials('Linda')).toBe('L')
    expect(assigneeInitials('   ')).toBe('?')
  })
})
