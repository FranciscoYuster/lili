/**
 * The activity bar renders icons as `<Icon size={n} />`, and the shared JiraIcon
 * only takes a className — an unsized inline SVG falls back to the browser's
 * 300x150 default and blows the bar apart. The wrapper pins the box instead.
 */

import { JiraIcon } from '@/components/icons/JiraIcon'
import { cn } from '@/lib/utils'

export function JiraTabIcon({
  size = 16,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <JiraIcon className={cn('size-full', className)} />
    </span>
  )
}
