import {
  occupancyFromCells,
  type DetectedGrids,
  type GridCell,
  type StashItemMeta,
  type WorldState,
} from "@poe2tc/core";

export const LIVE_OCCUPANCY_PREFIX = "live-occ:";
export const LIVE_DUMP_TAB_ID = "dump";
export const LIVE_GRID_CONFIDENCE = 0.7;

export function liveOccupancyFingerprint(
  kind: "inventory" | "stash",
  x: number,
  y: number,
): string {
  return `${LIVE_OCCUPANCY_PREFIX}${kind}:${String(x)}:${String(y)}`;
}

export function isLiveOccupancyFingerprint(fingerprint: string | undefined): boolean {
  return fingerprint !== undefined && fingerprint.startsWith(LIVE_OCCUPANCY_PREFIX);
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
 * Pixel occupancy does not invent item identities. When the bag is full, stamp
 * provisional occupancy tokens and a Dump catalog entry so StashController can
 * plan bag-to-stash. Clipboard/OCR identities remain the confirmed path.
 */
export function enrichLiveGrids(grids: DetectedGrids): EnrichedLiveGrids {
  const inventoryCells = grids.inventory?.cells ?? [];
  const occupancy = occupancyFromCells(inventoryCells, grids.inventory);
  const inventory =
    grids.inventory === undefined
      ? undefined
      : occupancy.full
        ? occupancyFromCells(stampOccupiedCells("inventory", occupancy.cells), occupancy)
        : occupancy;

  const stashCells = grids.stash?.cells ?? [];
  const stampedStash = occupancy.full ? stampOccupiedCells("stash", stashCells) : stashCells;
  const stash =
    grids.stash === undefined
      ? undefined
      : {
          ...grids.stash,
          tabId: grids.stash.tabId ?? LIVE_DUMP_TAB_ID,
          cells: stampedStash.map((cell) => ({
            ...cell,
            tabId: cell.tabId ?? grids.stash?.tabId ?? LIVE_DUMP_TAB_ID,
          })),
        };

  return {
    inventory,
    stash,
    catalog: dumpCatalog([...(inventory?.cells ?? []), ...(stash?.cells ?? [])]),
    source: grids.source,
    evidenceId: grids.evidenceId,
  };
}
