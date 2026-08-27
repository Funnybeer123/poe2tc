import type { GridCell } from "../world-state/types.js";

export interface OccupancyCounts {
  occupied: number;
  capacity: number;
  full: boolean;
  cells: GridCell[];
}

export interface OccupancyFallback {
  occupied?: number;
  capacity?: number;
  full?: boolean;
  /** When the stash panel is visible, treat 0–2 leftover 1x1 holes as a full bag. */
  stashOpen?: boolean;
}

/** Empty leftover cells still treated as a visually full bag when stash is open. */
export const NEAR_FULL_EMPTY_CELLS = 2;

export function occupancyFromCells(
  cells: GridCell[],
  fallback: OccupancyFallback = {},
): OccupancyCounts {
  if (cells.length === 0) {
    const capacity = fallback.capacity ?? 0;
    const occupied = fallback.occupied ?? 0;
    const full = fallback.full ?? (capacity > 0 && occupied >= capacity);
    return { occupied, capacity, full, cells };
  }
  const occupied = cells.filter((cell) => cell.occupied).length;
  const capacity = Math.max(cells.length, fallback.capacity ?? 0);
  const empty = capacity - occupied;
  const nearFull =
    fallback.stashOpen === true && capacity > 0 && empty >= 0 && empty <= NEAR_FULL_EMPTY_CELLS;
  return {
    occupied,
    capacity,
    full: (capacity > 0 && occupied >= capacity) || nearFull,
    cells,
  };
}

export function stashTabFull(cells: GridCell[], fallbackTabFull?: boolean): boolean {
  if (cells.length === 0) {
    return fallbackTabFull === true;
  }
  return cells.every((cell) => cell.occupied);
}

export function makeGridCells(options: {
  columns: number;
  rows: number;
  occupied?: ReadonlyArray<readonly [number, number] | { x: number; y: number; fingerprint?: string }>;
  tabId?: string;
  cellWidth?: number;
  cellHeight?: number;
}): GridCell[] {
  const occupiedAt = new Map<string, string | undefined>();
  for (const entry of options.occupied ?? []) {
    if ("x" in entry) {
      occupiedAt.set(`${String(entry.x)}:${String(entry.y)}`, entry.fingerprint);
    } else {
      occupiedAt.set(`${String(entry[0])}:${String(entry[1])}`, undefined);
    }
  }
  const cells: GridCell[] = [];
  for (let y = 0; y < options.rows; y += 1) {
    for (let x = 0; x < options.columns; x += 1) {
      const fingerprint = occupiedAt.get(`${String(x)}:${String(y)}`);
      const occupied = occupiedAt.has(`${String(x)}:${String(y)}`);
      cells.push({
        tabId: options.tabId,
        x,
        y,
        w: options.cellWidth ?? 1,
        h: options.cellHeight ?? 1,
        occupied,
        itemFingerprint: fingerprint,
      });
    }
  }
  return cells;
}
