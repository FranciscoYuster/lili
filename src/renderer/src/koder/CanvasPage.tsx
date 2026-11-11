/**
 * Canvas: every piece of live work in one space, instead of one workspace at a
 * time behind a click.
 *
 * The viewport transform lives in a ref and is written straight to the DOM.
 * Pointer-driven panning fires far faster than a render cycle, and routing each
 * frame through React would re-render every tile while a drag is in flight.
 *
 * Tiles show workspaces today. Cost per task and approval state join them once
 * the control plane feeds them back — that is the point of the view, and the
 * tile layout already reserves the room.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { useTranslate } from '@/i18n/use-translate'
import { XinxinMark } from './XinxinMark'
import { CanvasTile, type CanvasTileModel } from './CanvasTile'
import {
  defaultPosition,
  isTileLocked,
  readLayout,
  toggleTileLock,
  writeLayout,
  type TileLayout
} from './canvas-tile-layout'
import { buildLiveByWorktree } from './canvas-tile-live'
import { buildEconomyByWorktree, formatTokens, unattributedSpend } from './canvas-tile-economy'

const MIN_SCALE = 0.2
const MAX_SCALE = 3
const GRID_SIZE = 32

type Viewport = { x: number; y: number; scale: number }
type TileDrag = { id: string; offsetX: number; offsetY: number }

export default function CanvasPage(): React.JSX.Element {
  const t = useTranslate()
  const worktrees = useAllWorktrees()
  const repos = useAppStore((s) => s.repos)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const setActiveView = useAppStore((s) => s.setActiveView)
  // Status rows are keyed by pane and change on every agent event; the epoch is the
  // store's own cheap signal that something in that table moved.
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const projectBreakdown = useAppStore((s) => s.claudeUsageProjectBreakdown)
  const fetchClaudeUsage = useAppStore((s) => s.fetchClaudeUsage)
  const enableClaudeUsage = useAppStore((s) => s.enableClaudeUsage)
  const usageScanEnabled = useAppStore((s) => s.claudeUsageScanState?.enabled ?? null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 })
  const panOriginRef = useRef<{ x: number; y: number } | null>(null)
  const tileDragRef = useRef<TileDrag | null>(null)

  const [layout, setLayout] = useState<TileLayout>(() => readLayout())

  const repoNameById = useMemo(() => {
    const out = new Map<string, string>()
    for (const repo of repos) {
      out.set(repo.id, repo.displayName)
    }
    return out
  }, [repos])

  const liveByWorktree = useMemo(
    () => buildLiveByWorktree(agentStatusByPaneKey, tabsByWorktree),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the epoch is the store's change signal for the status table.
    [agentStatusByPaneKey, tabsByWorktree, agentStatusEpoch]
  )

  const economyByWorktree = useMemo(
    () => buildEconomyByWorktree(projectBreakdown),
    [projectBreakdown]
  )

  const unplaced = useMemo(() => unattributedSpend(projectBreakdown), [projectBreakdown])

  const tiles = useMemo<CanvasTileModel[]>(
    () =>
      worktrees
        .filter((worktree) => !worktree.isArchived)
        .map((worktree) => ({
          id: worktree.id,
          title: worktree.displayName,
          repoName: repoNameById.get(worktree.repoId) ?? worktree.repoId,
          linkedIssue: worktree.linkedIssue,
          linkedPR: worktree.linkedPR,
          isUnread: worktree.isUnread,
          isActive: worktree.id === activeWorktreeId,
          lastActivityAt: worktree.lastActivityAt,
          live: liveByWorktree.get(worktree.id) ?? null,
          economy: economyByWorktree.get(worktree.id) ?? null
        })),
    [worktrees, repoNameById, activeWorktreeId, liveByWorktree, economyByWorktree]
  )

  const positionFor = useCallback(
    (id: string, index: number) => layout[id] ?? defaultPosition(index),
    [layout]
  )

  const applyViewport = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface) {
      return
    }
    const { x, y, scale } = viewportRef.current
    surface.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }, [])

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      const viewport = viewportRef.current
      if (event.ctrlKey || event.metaKey) {
        // Zoom at the pointer: the point under the cursor stays put, which is
        // what makes this read as a surface rather than a scaled picture.
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, viewport.scale * (1 - event.deltaY * 0.002))
        )
        const ratio = next / viewport.scale
        viewport.x = event.clientX - (event.clientX - viewport.x) * ratio
        viewport.y = event.clientY - (event.clientY - viewport.y) * ratio
        viewport.scale = next
      } else {
        viewport.x -= event.deltaX
        viewport.y -= event.deltaY
      }
      applyViewport()
    },
    [applyViewport]
  )

  const startTileDrag = useCallback(
    (id: string, event: React.PointerEvent<HTMLDivElement>) => {
      if (isTileLocked(layout, id)) {
        // A pinned tile swallows the gesture rather than passing it to the
        // surface: panning from a tile you deliberately placed reads as a bug.
        return
      }
      const index = tiles.findIndex((tile) => tile.id === id)
      const position = positionFor(id, index === -1 ? 0 : index)
      const { scale } = viewportRef.current
      tileDragRef.current = {
        id,
        offsetX: event.clientX / scale - position.x,
        offsetY: event.clientY / scale - position.y
      }
      containerRef.current?.setPointerCapture(event.pointerId)
    },
    [tiles, positionFor, layout]
  )

  const toggleLock = useCallback(
    (id: string) => {
      const index = tiles.findIndex((tile) => tile.id === id)
      const fallback = positionFor(id, index === -1 ? 0 : index)
      setLayout((current) => toggleTileLock(current, id, fallback))
    },
    [tiles, positionFor]
  )

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) {
      return
    }
    panOriginRef.current = {
      x: event.clientX - viewportRef.current.x,
      y: event.clientY - viewportRef.current.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = tileDragRef.current
      if (drag) {
        const { scale } = viewportRef.current
        setLayout((current) => ({
          ...current,
          [drag.id]: {
            x: event.clientX / scale - drag.offsetX,
            y: event.clientY / scale - drag.offsetY
          }
        }))
        return
      }
      const origin = panOriginRef.current
      if (!origin) {
        return
      }
      viewportRef.current.x = event.clientX - origin.x
      viewportRef.current.y = event.clientY - origin.y
      applyViewport()
    },
    [applyViewport]
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (tileDragRef.current) {
      tileDragRef.current = null
      // Persist on release, not per frame: a drag fires hundreds of moves.
      setLayout((current) => {
        writeLayout(current)
        return current
      })
    }
    panOriginRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const openWorkspace = useCallback(
    (id: string) => {
      setActiveWorktree(id)
      setActiveView('terminal')
    },
    [setActiveWorktree, setActiveView]
  )

  const resetViewport = useCallback(() => {
    viewportRef.current = { x: 0, y: 0, scale: 1 }
    applyViewport()
  }, [applyViewport])

  useEffect(() => {
    applyViewport()
  }, [applyViewport])

  useEffect(() => {
    // Safe to call unconditionally: the fetch reads the opt-in flag first and returns
    // before scanning anything when it is off. That read is also what tells this view
    // whether to offer the opt-in at all, so skipping it would hide the offer forever.
    void fetchClaudeUsage?.()
  }, [fetchClaudeUsage])

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }
    // Why: a passive listener cannot preventDefault, and without that the page
    // zooms instead of the canvas.
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) {
        return
      }
      if (event.key === '0' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        resetViewport()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resetViewport])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none overflow-hidden bg-background"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-testid="canvas-viewport"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`
        }}
      />

      <div ref={surfaceRef} className="absolute inset-0 origin-top-left">
        {tiles.map((tile, index) => {
          const position = positionFor(tile.id, index)
          return (
            <CanvasTile
              key={tile.id}
              model={tile}
              x={position.x}
              y={position.y}
              isLocked={position.locked === true}
              onOpen={openWorkspace}
              onDragStart={startTileDrag}
              onToggleLock={toggleLock}
            />
          )
        })}
      </div>

      {tiles.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <XinxinMark size={40} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t(
                'koder.canvas.empty',
                'Aquí van a vivir tus workspaces, sesiones y terminales, todos en un espacio.'
              )}
            </p>
          </div>
        </div>
      ) : null}

      {usageScanEnabled === false ? (
        <button
          type="button"
          className="absolute top-3 right-3 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => void enableClaudeUsage?.()}
        >
          {t('koder.canvas.enableUsage', 'Medir tokens por espacio')}
        </button>
      ) : null}

      {unplaced.tokens > 0 ? (
        <p
          className="pointer-events-none absolute right-3 bottom-3 font-mono text-[11px] text-muted-foreground/60"
          title="Consumo registrado fuera de un espacio de trabajo"
        >
          {`sin asignar: ${formatTokens(unplaced.tokens)} tok`}
        </p>
      ) : null}

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[11px] text-muted-foreground/60">
        {t(
          'koder.canvas.hints',
          'rueda: desplazar · cmd+rueda: zoom · arrastrar: mover · pin: fijar · doble clic: abrir · 0: centrar'
        )}
      </p>
    </div>
  )
}
