import {
  LIVE_OCCUPANCY_PREFIX,
  isLiveOccupancyFingerprint,
  occupancyFromCells,
  type DetectedGrids,
  type GridCell,
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

function stampOccupiedCells(kind: "inventory" | "stash", cells: GridCell[]): GridCell[] {
  return cells.map((cell) => {
    if (!cell.occupied || (cell.itemFingerprint !== undefined && cell.itemFingerprint.length > 0)) {
      return cell;
    }
    return {
      ...cell,
      itemFingerprint: liveOccupancyFingerprint(kind, cell.x, cell.y),
    };
  });
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

export interface EnrichedLiveGrids {
  inventory?: WorldState["inventory"]["value"];
  stash?: WorldState["stash"]["value"];
  catalog: Record<string, StashItemMeta>;
  source: DetectedGrids["source"];
  evidenceId?: string;
}

/**
 * Pixel occupancy does not invent confirmed item identities. Every occupied
 * inventory cell gets a provisional occupancy token and Dump catalog entry so
 * StashController can plan bag-to-stash even when the bag is not full.
 */
export function enrichLiveGrids(grids: DetectedGrids): EnrichedLiveGrids {
  const inventoryCells = grids.inventory?.cells ?? [];
  const occupancy = occupancyFromCells(inventoryCells, grids.inventory);
  const inventory =
    grids.inventory === undefined
      ? undefined
      : occupancyFromCells(stampOccupiedCells("inventory", occupancy.cells), occupancy);

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
  };
}
