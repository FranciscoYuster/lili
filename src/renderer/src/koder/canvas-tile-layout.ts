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

export type TilePosition = { x: number; y: number }
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
      const { x, y } = value as Partial<TilePosition>
      // Why: a corrupt or half-written entry must not place a tile at NaN,
      // which renders it unreachable with no way to drag it back.
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out[id] = { x: x as number, y: y as number }
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
