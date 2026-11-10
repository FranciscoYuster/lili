/**
 * The avatar row: filter by person with a click instead of a JQL clause.
 *
 * Deliberately not a dropdown. A dropdown hides who is on the project behind an
 * interaction; a row of faces answers "who is carrying this sprint" before you
 * filter anything, which is most of the value.
 */

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  assigneeInitials,
  UNASSIGNED_ASSIGNEE_ID,
  type JiraAssigneeOption
} from './assignee-filter'

type Props = {
  options: readonly JiraAssigneeOption[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onClear: () => void
  clearLabel: string
  emptyLabel: string
}

export const JiraAssigneeFilter = memo(function JiraAssigneeFilter({
  options,
  selected,
  onToggle,
  onClear,
  clearLabel,
  emptyLabel
}: Props): React.JSX.Element | null {
  if (options.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      {options.map((option) => (
        <AssigneePill
          key={option.id}
          option={option}
          isSelected={selected.has(option.id)}
          onToggle={onToggle}
          emptyLabel={emptyLabel}
        />
      ))}
      {selected.size > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded px-1.5 py-0.5 text-2xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
})

function AssigneePill({
  option,
  isSelected,
  onToggle,
  emptyLabel
}: {
  option: JiraAssigneeOption
  isSelected: boolean
  onToggle: (id: string) => void
  emptyLabel: string
}): React.JSX.Element {
  // A broken avatar URL must fall back to initials rather than a torn-image icon.
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(option.avatarUrl) && !imageFailed
  const title = `${option.name} · ${option.count}`
  return (
    <button
      type="button"
      onClick={() => onToggle(option.id)}
      aria-pressed={isSelected}
      title={title}
      aria-label={title}
      className={cn(
        'relative size-6 shrink-0 overflow-hidden rounded-full border transition-all',
        isSelected
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border/60 opacity-70 hover:opacity-100'
      )}
    >
      {showImage ? (
        <img
          src={option.avatarUrl}
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className={cn(
            'flex size-full items-center justify-center text-[9px] font-medium',
            option.id === UNASSIGNED_ASSIGNEE_ID
              ? 'bg-muted text-muted-foreground'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {option.id === UNASSIGNED_ASSIGNEE_ID ? '—' : assigneeInitials(option.name)}
        </span>
      )}
      <span className="sr-only">
        {option.id === UNASSIGNED_ASSIGNEE_ID ? emptyLabel : option.name}
      </span>
    </button>
  )
}
