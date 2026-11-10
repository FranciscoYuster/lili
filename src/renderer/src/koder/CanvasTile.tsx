/**
 * One piece of live work on the canvas.
 *
 * The tile is not a card describing a workspace; it is the workspace, seen from
 * across the room. It answers three questions without a click: is something
 * running, does it need me, and what has it cost. The board this replaces
 * rendered a whole terminal per tile to answer the first one and could answer
 * neither of the others.
 *
 * The agent's own last words carry further than any status word, so they get
 * the body. The status chip is there for the glance; the text is there once you
 * lean in.
 */

import { memo } from 'react'
import { GitPullRequest, Hash, Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CanvasLiveInfo, CanvasLiveState } from './canvas-tile-live'
import { liveSummaryLine } from './canvas-tile-live'
import { formatCostUsd, formatTokens, type CanvasEconomy } from './canvas-tile-economy'

export type CanvasTileModel = {
  id: string
  title: string
  /** Project the workspace belongs to; repeated per tile because tiles move. */
  repoName: string
  linkedIssue: number | null
  linkedPR: number | null
  isUnread: boolean
  isActive: boolean
  lastActivityAt: number
  live: CanvasLiveInfo | null
  economy: CanvasEconomy | null
}

export const TILE_WIDTH = 320
export const TILE_HEIGHT = 208

const STATE_LABEL: Record<CanvasLiveState, string> = {
  permission: 'te espera',
  blocked: 'trancado',
  working: 'trabajando',
  monitoring: 'observando',
  done: 'listo',
  idle: 'quieto'
}

const STATE_CLASS: Record<CanvasLiveState, string> = {
  permission: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  blocked: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  working: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  monitoring: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  done: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  idle: 'bg-muted text-muted-foreground border-border/60'
}

/** Only genuinely ongoing work pulses; a finished agent must not keep asking for attention. */
const PULSING_STATES: ReadonlySet<CanvasLiveState> = new Set<CanvasLiveState>([
  'working',
  'permission'
])

function relativeTime(timestamp: number): string {
  if (!timestamp) {
    return '—'
  }
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)}h`
  }
  return `${Math.round(seconds / 86_400)}d`
}

type CanvasTileProps = {
  model: CanvasTileModel
  x: number
  y: number
  isLocked: boolean
  onOpen: (id: string) => void
  onDragStart: (id: string, event: React.PointerEvent<HTMLDivElement>) => void
  onToggleLock: (id: string) => void
}

export const CanvasTile = memo(function CanvasTile({
  model,
  x,
  y,
  isLocked,
  onOpen,
  onDragStart,
  onToggleLock
}: CanvasTileProps) {
  const state = model.live?.state ?? 'idle'
  const cost = formatCostUsd(model.economy?.estimatedCostUsd ?? null)
  return (
    <div
      className={cn(
        'group absolute flex select-none flex-col gap-2 rounded-xl border p-3 shadow-lg transition-colors',
        isLocked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        model.isActive
          ? 'border-primary/70 bg-card shadow-primary/10'
          : 'border-border/80 bg-card/95 hover:border-border'
      )}
      style={{ left: x, top: y, width: TILE_WIDTH, height: TILE_HEIGHT }}
      // Why: the canvas pans on pointer-down, so a tile drag has to claim the
      // gesture before it reaches the surface underneath.
      onPointerDown={(event) => {
        event.stopPropagation()
        onDragStart(model.id, event)
      }}
      onDoubleClick={() => onOpen(model.id)}
      data-testid="canvas-tile"
      data-state={state}
      data-locked={isLocked ? 'true' : 'false'}
    >
      <div className="flex min-w-0 items-start gap-2">
        {model.isUnread ? (
          <span
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
            aria-label="sin leer"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-5 font-medium text-foreground">
            {model.title}
          </p>
          <p className="truncate font-mono text-[11px] leading-4 text-muted-foreground">
            {model.repoName}
            {model.live?.model ? ` · ${model.live.model}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-4',
            STATE_CLASS[state]
          )}
        >
          {PULSING_STATES.has(state) ? (
            <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
          ) : null}
          {STATE_LABEL[state]}
        </span>
      </div>

      <LiveBody live={model.live} />

      <div className="mt-auto flex items-center gap-2 border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
        {model.linkedIssue !== null ? (
          <span className="flex items-center gap-1">
            <Hash className="size-3" />
            {model.linkedIssue}
          </span>
        ) : null}
        {model.linkedPR !== null ? (
          <span className="flex items-center gap-1">
            <GitPullRequest className="size-3" />
            {model.linkedPR}
          </span>
        ) : null}
        {model.economy ? (
          <span className="truncate font-mono" title="Costo estimado, no facturado">
            {formatTokens(model.economy.totalTokens)}
            {cost ? ` · US$${cost}` : ''}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 font-mono">{relativeTime(model.lastActivityAt)}</span>
        <button
          type="button"
          // Why stopPropagation on pointer-down: the tile claims that gesture to start
          // a drag, so without this the pin button would move the tile instead.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onToggleLock(model.id)
          }}
          className={cn(
            'shrink-0 rounded p-0.5 transition-opacity hover:text-foreground',
            // A pin only earns permanent space once it is holding something.
            isLocked ? 'text-foreground/70 opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          title={isLocked ? 'Soltar posición' : 'Fijar posición'}
          aria-label={isLocked ? 'Soltar posición' : 'Fijar posición'}
          aria-pressed={isLocked}
        >
          {isLocked ? <Pin className="size-3" /> : <PinOff className="size-3" />}
        </button>
      </div>
    </div>
  )
})

function LiveBody({ live }: { live: CanvasLiveInfo | null }): React.JSX.Element {
  if (!live || live.text === '') {
    return (
      <p className="flex-1 text-[11px] text-muted-foreground/50 italic">Sin actividad reciente.</p>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      {live.toolName ? (
        <p className="mb-1 truncate font-mono text-[10px] text-muted-foreground/70">
          {live.toolName}
        </p>
      ) : null}
      <p
        className={cn(
          'text-[11px] leading-[1.35]',
          // Tool output is the agent's input, not its voice; it reads as code and is dimmed.
          live.isToolOutput ? 'font-mono text-muted-foreground/70' : 'text-foreground/80'
        )}
      >
        {liveSummaryLine(live.text)}
      </p>
    </div>
  )
}
