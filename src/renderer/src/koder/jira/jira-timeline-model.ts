/**
 * The Cronograma: epics on top, their stories underneath, time across.
 *
 * A flat list answers "what is there". The question this view answers is "what
 * belongs to what, and when" — which is the shape a sprint is actually planned
 * in, and the one a flat list destroys.
 *
 * Dates come from two places and they are not the same kind of value. Jira's
 * `duedate` and its "Start date" custom field are calendar days (`YYYY-MM-DD`,
 * no timezone); `created` is an instant. Parsing a bare day with `new Date()`
 * lands on UTC midnight, which renders as the previous day for anyone west of
 * Greenwich — Chile included — so day-only values are pinned to local noon.
 */

import type { JiraIssue } from '../../../../shared/jira/jira-types'

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/
export const DAY_MS = 86_400_000

export function parseJiraDate(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  if (DAY_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    // Local noon: far enough from both midnights that no offset moves the date.
    return new Date(year as number, (month as number) - 1, day as number, 12).getTime()
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export type TimelineSpan = {
  startMs: number
  endMs: number
  /** False when the end is inferred, so the bar can say it is not a commitment. */
  hasDueDate: boolean
  /** False when the start fell back to the creation date. */
  hasStartDate: boolean
}

export function issueSpan(issue: JiraIssue): TimelineSpan | null {
  const start = parseJiraDate(issue.startDate)
  const due = parseJiraDate(issue.dueDate)
  const created = parseJiraDate(issue.createdAt)
  const startMs = start ?? created
  if (startMs === null) {
    return null
  }
  // A due date before the start is bad data, not a negative bar: clamp to a day.
  const endMs = due === null ? startMs + DAY_MS : Math.max(due, startMs + DAY_MS)
  return { startMs, endMs, hasDueDate: due !== null, hasStartDate: start !== null }
}

export type TimelineGroup = {
  key: string
  label: string
  /** The epic itself when it is in the result set; null for the orphan group. */
  epic: JiraIssue | null
  issues: JiraIssue[]
}

export const UNPARENTED_GROUP_KEY = '__no_epic__'

function isParentOfAny(issue: JiraIssue, parentKeys: ReadonlySet<string>): boolean {
  return parentKeys.has(issue.key)
}

/**
 * Groups by `parent`, which Jira sets for both epic→story and story→subtask. An
 * issue that is some other issue's parent heads its own group even when the
 * query also returned it as a row, so it never appears twice.
 */
export function buildTimelineGroups(
  issues: readonly JiraIssue[],
  unparentedLabel: string
): TimelineGroup[] {
  const parentKeys = new Set(
    issues.map((issue) => issue.parent?.key).filter((key): key is string => Boolean(key))
  )
  const byKey = new Map(issues.map((issue) => [issue.key, issue]))
  const groups = new Map<string, TimelineGroup>()
  const orphans: JiraIssue[] = []

  for (const issue of issues) {
    const parentKey = issue.parent?.key
    if (!parentKey) {
      // A parent with no parent of its own heads its group rather than floating.
      if (!isParentOfAny(issue, parentKeys)) {
        orphans.push(issue)
      }
      continue
    }
    const existing = groups.get(parentKey)
    if (existing) {
      existing.issues.push(issue)
      continue
    }
    const epic = byKey.get(parentKey) ?? null
    groups.set(parentKey, {
      key: parentKey,
      label: epic?.title ?? issue.parent?.title ?? parentKey,
      epic,
      issues: [issue]
    })
  }

  for (const key of parentKeys) {
    const epic = byKey.get(key)
    if (epic && !groups.has(key)) {
      groups.set(key, { key, label: epic.title, epic, issues: [] })
    }
  }

  const ordered = [...groups.values()].sort((left, right) => left.label.localeCompare(right.label))
  if (orphans.length > 0) {
    // Last, because an orphan group is a gap in the plan rather than part of it.
    ordered.push({
      key: UNPARENTED_GROUP_KEY,
      label: unparentedLabel,
      epic: null,
      issues: orphans
    })
  }
  return ordered
}

export type TimelineBounds = { startMs: number; endMs: number }

/** Covers every span, padded so bars never touch the edges, and never zero-width. */
export function timelineBounds(issues: readonly JiraIssue[]): TimelineBounds | null {
  let startMs = Number.POSITIVE_INFINITY
  let endMs = Number.NEGATIVE_INFINITY
  for (const issue of issues) {
    const span = issueSpan(issue)
    if (!span) {
      continue
    }
    startMs = Math.min(startMs, span.startMs)
    endMs = Math.max(endMs, span.endMs)
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null
  }
  const padding = Math.max((endMs - startMs) * 0.04, DAY_MS * 2)
  return { startMs: startMs - padding, endMs: endMs + padding }
}

/** A group's own bar is the hull of its children, so a collapsed epic still reads. */
export function groupSpan(group: TimelineGroup): TimelineSpan | null {
  const members = group.epic ? [group.epic, ...group.issues] : group.issues
  const spans = members.map(issueSpan).filter((span): span is TimelineSpan => span !== null)
  if (spans.length === 0) {
    return null
  }
  return {
    startMs: Math.min(...spans.map((span) => span.startMs)),
    endMs: Math.max(...spans.map((span) => span.endMs)),
    hasDueDate: spans.some((span) => span.hasDueDate),
    hasStartDate: spans.some((span) => span.hasStartDate)
  }
}

export type BarGeometry = { leftPercent: number; widthPercent: number }

export function barGeometry(span: TimelineSpan, bounds: TimelineBounds): BarGeometry {
  const total = bounds.endMs - bounds.startMs
  if (total <= 0) {
    return { leftPercent: 0, widthPercent: 100 }
  }
  const leftPercent = ((span.startMs - bounds.startMs) / total) * 100
  // A floor keeps a one-day task from rendering as an invisible hairline.
  const widthPercent = Math.max(((span.endMs - span.startMs) / total) * 100, 0.8)
  return {
    leftPercent: Math.max(0, Math.min(leftPercent, 100)),
    widthPercent: Math.min(widthPercent, 100 - Math.max(0, Math.min(leftPercent, 100)))
  }
}

export type TimelineTick = { label: string; leftPercent: number; key: string }

/** One tick per month start inside the bounds, for the header scale. */
export function monthTicks(bounds: TimelineBounds, locale: string): TimelineTick[] {
  const total = bounds.endMs - bounds.startMs
  if (total <= 0) {
    return []
  }
  const ticks: TimelineTick[] = []
  const cursor = new Date(bounds.startMs)
  cursor.setDate(1)
  cursor.setHours(12, 0, 0, 0)
  if (cursor.getTime() < bounds.startMs) {
    cursor.setMonth(cursor.getMonth() + 1)
  }
  // A guard, not a limit: a corrupt bound must not spin here.
  for (let index = 0; index < 240 && cursor.getTime() <= bounds.endMs; index += 1) {
    ticks.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleDateString(locale, { month: 'short' }),
      leftPercent: ((cursor.getTime() - bounds.startMs) / total) * 100
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return ticks
}

export function todayMarker(bounds: TimelineBounds, now = Date.now()): number | null {
  const total = bounds.endMs - bounds.startMs
  if (total <= 0 || now < bounds.startMs || now > bounds.endMs) {
    return null
  }
  return ((now - bounds.startMs) / total) * 100
}
