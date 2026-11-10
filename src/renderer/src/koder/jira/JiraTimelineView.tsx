/**
 * Cronograma: the epic→story hierarchy with time across.
 *
 * The whole loaded range is fitted to the width rather than scrolled at a fixed
 * day-width. A sprint board is read by comparing bars to each other and to
 * today, not by measuring them, and fitting keeps every bar on screen where a
 * fixed scale would push half the plan past the right edge.
 *
 * A bar whose issue has no due date is drawn hollow. Jira lets a ticket exist
 * with no end, and inventing one would turn a missing commitment into a
 * confident-looking plan.
 */

import { memo, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JiraIssue } from '../../../../shared/jira/jira-types'
import {
  barGeometry,
  buildTimelineGroups,
  groupSpan,
  issueSpan,
  monthTicks,
  timelineBounds,
  todayMarker,
  type TimelineBounds,
  type TimelineGroup,
  type TimelineSpan
} from './jira-timeline-model'

type Props = {
  issues: readonly JiraIssue[]
  selectedIssue: JiraIssue | null
  onOpenIssue: (issue: JiraIssue) => void
  unparentedLabel: string
  activityLabel: string
  emptyLabel: string
  noDatesLabel: string
  locale: string
}

export const JiraTimelineView = memo(function JiraTimelineView({
  issues,
  selectedIssue,
  onOpenIssue,
  unparentedLabel,
  activityLabel,
  emptyLabel,
  noDatesLabel,
  locale
}: Props): React.JSX.Element {
  const groups = useMemo(
    () => buildTimelineGroups(issues, unparentedLabel),
    [issues, unparentedLabel]
  )
  const bounds = useMemo(() => timelineBounds(issues), [issues])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>())

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  const ticks = bounds ? monthTicks(bounds, locale) : []
  const today = bounds ? todayMarker(bounds) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-none items-stretch border-b border-border/50 bg-muted/25">
        <div className="w-[340px] shrink-0 border-r border-border/50 px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {activityLabel}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className="absolute top-1.5 text-2xs text-muted-foreground"
              style={{ left: `${tick.leftPercent}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <GroupRows
            key={group.key}
            group={group}
            bounds={bounds}
            isCollapsed={collapsed.has(group.key)}
            onToggle={() =>
              setCollapsed((current) => {
                const next = new Set(current)
                if (!next.delete(group.key)) {
                  next.add(group.key)
                }
                return next
              })
            }
            selectedKey={selectedIssue?.key ?? null}
            onOpenIssue={onOpenIssue}
            noDatesLabel={noDatesLabel}
            todayPercent={today}
          />
        ))}
      </div>
    </div>
  )
})

function GroupRows({
  group,
  bounds,
  isCollapsed,
  onToggle,
  selectedKey,
  onOpenIssue,
  noDatesLabel,
  todayPercent
}: {
  group: TimelineGroup
  bounds: TimelineBounds | null
  isCollapsed: boolean
  onToggle: () => void
  selectedKey: string | null
  onOpenIssue: (issue: JiraIssue) => void
  noDatesLabel: string
  todayPercent: number | null
}): React.JSX.Element {
  const span = groupSpan(group)
  const Chevron = isCollapsed ? ChevronRight : ChevronDown
  return (
    <div>
      <div className="flex items-stretch border-b border-border/30 bg-muted/20">
        <div className="flex w-[340px] shrink-0 items-center gap-1.5 border-r border-border/50 px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={!isCollapsed}
            aria-label={group.label}
          >
            <Chevron className="size-3.5" />
          </button>
          {group.epic ? (
            <button
              type="button"
              onClick={() => onOpenIssue(group.epic as JiraIssue)}
              className="shrink-0 font-mono text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {group.epic.key}
            </button>
          ) : null}
          <span className="truncate text-xs font-medium text-foreground">{group.label}</span>
          <span className="ml-auto shrink-0 font-mono text-2xs text-muted-foreground">
            {group.issues.length}
          </span>
        </div>
        <Lane bounds={bounds} todayPercent={todayPercent}>
          {span && bounds ? (
            <Bar span={span} bounds={bounds} tone="epic" noDatesLabel={noDatesLabel} />
          ) : null}
        </Lane>
      </div>

      {isCollapsed
        ? null
        : group.issues.map((issue) => {
            const childSpan = issueSpan(issue)
            return (
              <div
                key={issue.key}
                className={cn(
                  'flex items-stretch border-b border-border/20 transition-colors hover:bg-muted/30',
                  issue.key === selectedKey && 'bg-muted/40'
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpenIssue(issue)}
                  className="flex w-[340px] shrink-0 items-center gap-1.5 border-r border-border/50 py-1.5 pr-2 pl-8 text-left"
                >
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    {issue.key}
                  </span>
                  <span className="truncate text-xs text-foreground/90">{issue.title}</span>
                  <span className="ml-auto shrink-0 truncate text-2xs text-muted-foreground">
                    {issue.status.name}
                  </span>
                </button>
                <Lane bounds={bounds} todayPercent={todayPercent}>
                  {childSpan && bounds ? (
                    <Bar
                      span={childSpan}
                      bounds={bounds}
                      tone="story"
                      noDatesLabel={noDatesLabel}
                    />
                  ) : null}
                </Lane>
              </div>
            )
          })}
    </div>
  )
}

function Lane({
  bounds,
  todayPercent,
  children
}: {
  bounds: TimelineBounds | null
  todayPercent: number | null
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="relative min-w-0 flex-1 px-1 py-1.5">
      {bounds && todayPercent !== null ? (
        <span
          className="pointer-events-none absolute inset-y-0 w-px bg-primary/50"
          style={{ left: `${todayPercent}%` }}
        />
      ) : null}
      {children}
    </div>
  )
}

function Bar({
  span,
  bounds,
  tone,
  noDatesLabel
}: {
  span: TimelineSpan
  bounds: TimelineBounds
  tone: 'epic' | 'story'
  noDatesLabel: string
}): React.JSX.Element {
  const { leftPercent, widthPercent } = barGeometry(span, bounds)
  return (
    <span
      className={cn(
        'absolute top-1/2 h-2 -translate-y-1/2 rounded-full',
        tone === 'epic' ? 'bg-primary/70' : 'bg-primary/45',
        // Hollow means "no due date in Jira", not "zero length".
        span.hasDueDate ? '' : 'border border-dashed border-primary/60 bg-transparent'
      )}
      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
      title={span.hasDueDate ? undefined : noDatesLabel}
    />
  )
}
