/**
 * Presentational pieces of the Economy panel, split out so the panel file stays
 * under the repo's per-file line ceiling. No data decisions live here.
 */

import { cn } from '@/lib/utils'

export function Segment({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded px-1.5 py-0.5 text-[11px] transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

export function Kpi({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-2.5 py-2">
      <p className="truncate text-[10px] tracking-wide text-muted-foreground/70 uppercase">
        {label}
      </p>
      <p className="truncate font-mono text-[15px] leading-6 text-foreground">{value}</p>
    </div>
  )
}

export function Row({
  name,
  detail,
  value,
  onClick,
  isActive
}: {
  name: string
  detail: string
  value: string
  onClick?: () => void
  isActive?: boolean
}): React.JSX.Element {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[12px]',
            isActive ? 'text-foreground' : 'text-foreground/90'
          )}
        >
          {name}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{value}</span>
    </>
  )
  if (!onClick) {
    return <div className="flex items-center gap-2 px-3 py-1.5">{content}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/40',
        isActive && 'bg-muted/30'
      )}
    >
      {content}
    </button>
  )
}

export function Section({
  label,
  count,
  children
}: {
  label: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="py-1">
      <p className="px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
        {label} · {count}
      </p>
      {children}
    </section>
  )
}
