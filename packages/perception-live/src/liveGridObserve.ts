import {
  LIVE_OCCUPANCY_PREFIX,
  isLiveOccupancyFingerprint,
  occupancyFromCells,
  type DetectedGrids,
  type GridCell,
  type GridGeometry,
  type StashItemMeta,
  type WorldState,
} from "@poe2tc/core";

export { LIVE_OCCUPANCY_PREFIX, isLiveOccupancyFingerprint };
export const LIVE_DUMP_TAB_ID = "dump";
export const LIVE_GRID_CONFIDENCE = 0.7;

export function liveOccupancyFingerprint(
  kind: "inventory" | "stash",
  x: number,
  y: number,
): string {
  return `${LIVE_OCCUPANCY_PREFIX}${kind}:${String(x)}:${String(y)}`;
}

function cellKey(x: number, y: number): string {
  return `${String(x)}:${String(y)}`;
}

/**
 * Group connected occupied cells into one item at the top-left origin so a 2xN
 * weapon is one dump move, not eight 1x1 drags.
 */
export function clusterOccupiedItemOrigins(
  kind: "inventory" | "stash",
  cells: GridCell[],
): GridCell[] {
  const byPos = new Map(cells.map((cell) => [cellKey(cell.x, cell.y), { ...cell }]));
  const visited = new Set<string>();

  for (const start of byPos.values()) {
    const startKey = cellKey(start.x, start.y);
    if (!start.occupied || visited.has(startKey)) {
      continue;
    }
    const component: GridCell[] = [];
    const stack = [start];
    visited.add(startKey);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(current);
      for (const [nx, ny] of [
        [current.x - 1, current.y],
        [current.x + 1, current.y],
        [current.x, current.y - 1],
        [current.x, current.y + 1],
      ] as const) {
        const next = byPos.get(cellKey(nx, ny));
        const nextKey = cellKey(nx, ny);
        if (next === undefined || !next.occupied || visited.has(nextKey)) {
          continue;
        }
        visited.add(nextKey);
        stack.push(next);
      }
    }
    component.sort((left, right) => left.y - right.y || left.x - right.x);
    const origin = component[0];
    if (origin === undefined) {
      continue;
    }
    const maxX = Math.max(...component.map((cell) => cell.x));
    const maxY = Math.max(...component.map((cell) => cell.y));
    const fingerprint = liveOccupancyFingerprint(kind, origin.x, origin.y);
    origin.itemFingerprint = fingerprint;
    origin.w = maxX - origin.x + 1;
    origin.h = maxY - origin.y + 1;
    for (const extra of component.slice(1)) {
      extra.itemFingerprint = undefined;
      extra.w = 1;
      extra.h = 1;
    }
  }

  return cells.map((cell) => byPos.get(cellKey(cell.x, cell.y)) ?? cell);
}

function dumpCatalog(cells: GridCell[]): Record<string, StashItemMeta> {
  const catalog: Record<string, StashItemMeta> = {};
  for (const cell of cells) {
    if (!isLiveOccupancyFingerprint(cell.itemFingerprint)) {
      continue;
    }
    catalog[cell.itemFingerprint as string] = { category: "Dump", score: 1 };
  }
  return catalog;
}

export interface LiveGridLog {
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  occupied: number;
  capacity: number;
  full: boolean;
}

export interface EnrichedLiveGrids {
  inventory?: WorldState["inventory"]["value"];
  stash?: WorldState["stash"]["value"];
  catalog: Record<string, StashItemMeta>;
  source: DetectedGrids["source"];
  evidenceId?: string;
  inventoryGrid?: GridGeometry;
  stashGrid?: GridGeometry;
  liveGrid?: LiveGridLog;
  liveStashGrid?: Pick<
    LiveGridLog,
    "originX" | "originY" | "cellWidth" | "cellHeight" | "columns" | "rows"
  >;
}

function liveGridLog(
  geometry: GridGeometry | undefined,
  occupancy: { occupied: number; capacity: number; full: boolean },
): LiveGridLog | undefined {
  if (geometry === undefined) {
    return undefined;
  }
  return {
    originX: geometry.originX,
    originY: geometry.originY,
    cellWidth: geometry.cellWidth,
    cellHeight: geometry.cellHeight,
    columns: geometry.columns,
    rows: geometry.rows,
    occupied: occupancy.occupied,
    capacity: occupancy.capacity,
    full: occupancy.full,
  };
}

/**
 * Pixel occupancy does not invent confirmed item identities. Occupied cells are
 * clustered into dump tokens at each item origin so StashController can plan
 * bag-to-stash from the top-left of multi-cell items.
 */
export function enrichLiveGrids(grids: DetectedGrids): EnrichedLiveGrids {
  const inventoryCells = clusterOccupiedItemOrigins("inventory", grids.inventory?.cells ?? []);
  const stashOpen = (grids.stash?.cells.length ?? 0) > 0;
  const occupancy = occupancyFromCells(inventoryCells, {
    ...grids.inventory,
    stashOpen,
  });
  const inventory = grids.inventory === undefined ? undefined : occupancy;

  const stashCells = grids.stash?.cells ?? [];
  const stash =
    grids.stash === undefined
      ? undefined
      : {
          ...grids.stash,
          tabId: grids.stash.tabId ?? LIVE_DUMP_TAB_ID,
          cells: stashCells.map((cell) => ({
            ...cell,
            tabId: cell.tabId ?? grids.stash?.tabId ?? LIVE_DUMP_TAB_ID,
          })),
        };

  return {
    inventory,
    stash,
    catalog: dumpCatalog(inventory?.cells ?? []),
    source: grids.source,
    evidenceId: grids.evidenceId,
    inventoryGrid: grids.inventoryGrid,
    stashGrid: grids.stashGrid,
    liveGrid: liveGridLog(grids.inventoryGrid, occupancy),
    liveStashGrid:
      grids.stashGrid === undefined
        ? undefined
        : {
            originX: grids.stashGrid.originX,
            originY: grids.stashGrid.originY,
            cellWidth: grids.stashGrid.cellWidth,
            cellHeight: grids.stashGrid.cellHeight,
            columns: grids.stashGrid.columns,
            rows: grids.stashGrid.rows,
          },
  };
}
