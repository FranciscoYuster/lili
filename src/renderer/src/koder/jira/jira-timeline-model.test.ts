import { describe, expect, it } from 'vitest'
import type { JiraIssue } from '../../../../shared/jira/jira-types'
import {
  barGeometry,
  buildTimelineGroups,
  DAY_MS,
  groupSpan,
  issueSpan,
  parseJiraDate,
  timelineBounds,
  todayMarker,
  UNPARENTED_GROUP_KEY
} from './jira-timeline-model'

function issue(partial: Partial<JiraIssue> & { key: string }): JiraIssue {
  return {
    id: partial.key,
    title: partial.key,
    url: `https://example.atlassian.net/browse/${partial.key}`,
    project: { id: '1', key: 'DILER', name: 'diler' },
    issueType: { id: '1', name: 'Story' },
    status: { id: '1', name: 'To Do' } as JiraIssue['status'],
    labels: [],
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
    ...partial
  }
}

describe('parseJiraDate', () => {
  it('pins a bare calendar day to local noon so no timezone shifts the day', () => {
    const parsed = parseJiraDate('2026-03-05')
    expect(parsed).not.toBeNull()
    const asDate = new Date(parsed as number)
    expect(asDate.getFullYear()).toBe(2026)
    expect(asDate.getMonth()).toBe(2)
    expect(asDate.getDate()).toBe(5)
  })

  it('returns null for absent and unparseable values', () => {
    expect(parseJiraDate(undefined)).toBeNull()
    expect(parseJiraDate('not a date')).toBeNull()
  })
})

describe('issueSpan', () => {
  it('falls back to creation when the site has no start date field', () => {
    const span = issueSpan(issue({ key: 'DILER-1', dueDate: '2026-02-01' }))
    expect(span?.hasStartDate).toBe(false)
    expect(span?.hasDueDate).toBe(true)
  })

  it('marks a missing due date instead of inventing an end', () => {
    const span = issueSpan(issue({ key: 'DILER-2', startDate: '2026-01-05' }))
    expect(span?.hasDueDate).toBe(false)
    expect((span as { endMs: number }).endMs - (span as { startMs: number }).startMs).toBe(DAY_MS)
  })

  it('clamps a due date that precedes the start rather than drawing backwards', () => {
    const span = issueSpan(
      issue({ key: 'DILER-3', startDate: '2026-02-10', dueDate: '2026-01-01' })
    )
    expect((span as { endMs: number }).endMs).toBeGreaterThan((span as { startMs: number }).startMs)
  })
})

describe('buildTimelineGroups', () => {
  const rows = [
    issue({ key: 'DILER-3', title: 'APP' }),
    issue({ key: 'DILER-241', title: 'QA Web', parent: { key: 'DILER-3', title: 'APP' } }),
    issue({ key: 'DILER-282', title: 'Refactor', parent: { key: 'DILER-3', title: 'APP' } }),
    issue({ key: 'DILER-900', title: 'Suelta' })
  ]

  it('puts stories under their epic and never repeats the epic as a row', () => {
    const groups = buildTimelineGroups(rows, 'Sin épica')
    const epicGroup = groups.find((group) => group.key === 'DILER-3')
    expect(epicGroup?.issues.map((row) => row.key)).toEqual(['DILER-241', 'DILER-282'])
    expect(epicGroup?.epic?.key).toBe('DILER-3')
  })

  it('collects parentless issues last, in their own group', () => {
    const groups = buildTimelineGroups(rows, 'Sin épica')
    expect(groups.at(-1)?.key).toBe(UNPARENTED_GROUP_KEY)
    expect(groups.at(-1)?.issues.map((row) => row.key)).toEqual(['DILER-900'])
  })

  it('keeps an epic whose children are missing from the result set', () => {
    const groups = buildTimelineGroups(
      [issue({ key: 'DILER-5', parent: { key: 'DILER-4', title: 'WEB' } })],
      'Sin épica'
    )
    expect(groups.map((group) => group.key)).toEqual(['DILER-4'])
    expect(groups[0]?.epic).toBeNull()
    expect(groups[0]?.label).toBe('WEB')
  })

  it('returns nothing for an empty result rather than an orphan group', () => {
    expect(buildTimelineGroups([], 'Sin épica')).toEqual([])
  })
})

describe('groupSpan', () => {
  it('spans the hull of its children so a collapsed epic still reads', () => {
    const groups = buildTimelineGroups(
      [
        issue({ key: 'E-1', title: 'Epic' }),
        issue({
          key: 'S-1',
          startDate: '2026-01-01',
          dueDate: '2026-01-10',
          parent: { key: 'E-1', title: 'Epic' }
        }),
        issue({
          key: 'S-2',
          startDate: '2026-02-01',
          dueDate: '2026-03-01',
          parent: { key: 'E-1', title: 'Epic' }
        })
      ],
      'Sin épica'
    )
    const span = groupSpan(groups[0] as never)
    expect(new Date(span?.startMs as number).getMonth()).toBe(0)
    expect(new Date(span?.endMs as number).getMonth()).toBe(2)
  })
})

describe('barGeometry', () => {
  const bounds = { startMs: 0, endMs: 100 * DAY_MS }

  it('keeps a one-day bar visible instead of a hairline', () => {
    const geometry = barGeometry(
      { startMs: 0, endMs: DAY_MS, hasDueDate: false, hasStartDate: true },
      bounds
    )
    expect(geometry.widthPercent).toBeGreaterThanOrEqual(0.8)
  })

  it('never lets a bar run past the right edge', () => {
    const geometry = barGeometry(
      { startMs: 90 * DAY_MS, endMs: 500 * DAY_MS, hasDueDate: true, hasStartDate: true },
      bounds
    )
    expect(geometry.leftPercent + geometry.widthPercent).toBeLessThanOrEqual(100.001)
  })
})

describe('timelineBounds and todayMarker', () => {
  it('is null when nothing carries a usable date', () => {
    expect(timelineBounds([])).toBeNull()
  })

  it('hides the today line when today sits outside the range', () => {
    const bounds = { startMs: 0, endMs: 10 * DAY_MS }
    expect(todayMarker(bounds, 50 * DAY_MS)).toBeNull()
    expect(todayMarker(bounds, 5 * DAY_MS)).toBeCloseTo(50)
  })
})
