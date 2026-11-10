/**
 * Where each tile sits on the canvas.
 *
 * Positions are a per-viewer convenience, not shared state: they live in
 * localStorage so a reload keeps your arrangement, and every read and write is
 * guarded because private windows, cleared site data and thumbnail capture all
 * make the accessor throw or come back empty. A missing layout is not an error
 * — new tiles fall into the default grid and the canvas renders the same.
 */

import { TILE_HEIGHT, TILE_WIDTH } from './CanvasTile'

// v2: tiles grew from 240x128 to 320x208, so v1 arrangements now overlap.
const STORAGE_KEY = 'koder.canvas.tilePositions.v2'
const COLUMN_GAP = 32
const ROW_GAP = 32
const COLUMNS = 3
const ORIGIN_X = 64
const ORIGIN_Y = 64

export type TilePosition = { x: number; y: number; locked?: boolean }
export type TileLayout = Record<string, TilePosition>

/** Reading-order grid, so a first visit looks deliberate rather than stacked. */
export function defaultPosition(index: number): TilePosition {
  const column = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  return {
    x: ORIGIN_X + column * (TILE_WIDTH + COLUMN_GAP),
    y: ORIGIN_Y + row * (TILE_HEIGHT + ROW_GAP)
  }
}

export function readLayout(): TileLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const out: TileLayout = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) {
        continue
      }
      const { x, y, locked } = value as Partial<TilePosition>
      // Why: a corrupt or half-written entry must not place a tile at NaN,
      // which renders it unreachable with no way to drag it back.
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out[id] = { x: x as number, y: y as number, ...(locked === true ? { locked: true } : {}) }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function writeLayout(layout: TileLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage is a convenience here; losing it costs the arrangement, nothing else.
  }
}

/**
 * A pinned tile refuses the drag gesture.
 *
 * Why this exists: a tile you placed deliberately — the one workspace you keep
 * glancing at — is the one a stray pointer-down moves. Position is the only
 * thing on this canvas with no undo, so the pin is cheaper than the mistake.
 */
export function isTileLocked(layout: TileLayout, id: string): boolean {
  return layout[id]?.locked === true
}

/**
 * Pinning a tile that never moved has to write its current place, not leave it
 * to the default grid: the grid is index-based, so adding a workspace would
 * otherwise slide a pinned tile somewhere else.
 */
export function toggleTileLock(layout: TileLayout, id: string, fallback: TilePosition): TileLayout {
  const current = layout[id] ?? fallback
  const next: TileLayout = {
    ...layout,
    [id]: { x: current.x, y: current.y, ...(current.locked === true ? {} : { locked: true }) }
  }
  writeLayout(next)
  return next
}
