/**
 * Presentational pieces of the harness generator, split out so the dialog file
 * stays under the project's line ceiling and reads as flow rather than markup.
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { HarnessPlanAction } from './harness-plan'

export function Field({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
  invalid
}: {
  id: string
  label: string
  hint?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  invalid?: boolean
}): React.JSX.Element {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-8 font-mono text-[12px]', invalid && 'border-rose-500')}
      />
      {hint ? <p className="text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  )
}

const ACTION_CLASS: Record<HarnessPlanAction, string> = {
  create: 'text-emerald-500',
  merge: 'text-sky-500',
  keep: 'text-muted-foreground',
  conflict: 'text-rose-500'
}

export function PlanRow({
  relativePath,
  action,
  actionLabel,
  reason
}: {
  relativePath: string
  action: HarnessPlanAction
  actionLabel: string
  reason: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span
        className={cn(
          'w-16 shrink-0 font-mono text-[10px] tracking-wide uppercase',
          ACTION_CLASS[action]
        )}
      >
        {actionLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12px] text-foreground">{relativePath}</p>
        <p className="truncate text-[10px] text-muted-foreground">{reason}</p>
      </div>
    </div>
  )
}
