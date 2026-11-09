/**
 * Lili's mark: a halftone grid that resolves from noise into a solid edge.
 *
 * The name comes from 历历 (lìlì) — "every detail, distinctly" — as in 历历在目,
 * things so clear they seem to stand right before your eyes. The dots carry that
 * literally: sparse and faint on the left, dense and touching on the right, so
 * scattered detail becomes a legible whole. It is also the screentone of
 * single-ink manga printing, where every grey is really a count of dots.
 *
 * Drawn on a 24x24 grid with five columns of growing radius. Nothing here is
 * thinner than a hairline at 16px, so the mark survives a favicon and a dock
 * icon without a second asset.
 */

const COLUMN_RADII = [0.65, 1, 1.4, 1.8, 2] as const
const GRID_POSITIONS = [2.6, 7.3, 12, 16.7, 21.4] as const

type LiliMarkProps = {
  /** Rendered edge length in px. The viewBox scales, so any size stays sharp. */
  size?: number
  className?: string
  /** Set when the mark stands alone; omit when adjacent text already names it. */
  title?: string
}

export function LiliMark({ size = 24, className, title }: LiliMarkProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {GRID_POSITIONS.map((cx, column) =>
        GRID_POSITIONS.map((cy) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={COLUMN_RADII[column]}
            fill="currentColor"
            // Why: opacity climbs with radius so the left edge reads as grain
            // rather than as small dots of the same ink.
            opacity={0.45 + column * 0.1375}
          />
        ))
      )}
    </svg>
  )
}
