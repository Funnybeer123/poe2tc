import {
  layoutPoe2OpenStashBagGrids,
  type GridGeometry,
} from "../inventory/gridGeometry.js";
import type { GridCell, PixelPoint, WorldStateFlags } from "../world-state/types.js";

export const DEFAULT_INVENTORY_GRID: GridGeometry = {
  originX: 100,
  originY: 500,
  cellWidth: 50,
  cellHeight: 50,
  columns: 12,
  rows: 5,
};

export const DEFAULT_STASH_GRID: GridGeometry = {
  originX: 800,
  originY: 500,
  cellWidth: 50,
  cellHeight: 50,
  columns: 12,
  rows: 12,
};

export const DEFAULT_TAB_CLICKS: Record<string, PixelPoint> = {
  currency: { x: 820, y: 350 },
  waystones: { x: 870, y: 350 },
  uniques: { x: 920, y: 350 },
  "high-value-sell": { x: 970, y: 350 },
  "normal-sell": { x: 1020, y: 350 },
  crafting: { x: 1070, y: 350 },
  bulk: { x: 1120, y: 350 },
  dump: { x: 1170, y: 350 },
  vendor: { x: 1220, y: 350 },
};

export function cellCenter(
  cell: Pick<GridCell, "x" | "y" | "w" | "h">,
  grid: GridGeometry,
): PixelPoint {
  const width = grid.cellWidth;
  const height = grid.cellHeight;
  return {
    x: grid.originX + cell.x * width + width / 2,
    y: grid.originY + cell.y * height + height / 2,
  };
}

export function tabClickPoint(tabId: string, stash: GridGeometry = DEFAULT_STASH_GRID): PixelPoint {
  return DEFAULT_TAB_CLICKS[tabId] ?? { x: stash.originX, y: 350 };
}

function geometryFromLiveFlag(
  live:
    | {
        originX: number;
        originY: number;
        cellWidth: number;
        cellHeight: number;
        columns: number;
        rows: number;
      }
    | undefined,
): GridGeometry | undefined {
  if (
    live === undefined ||
    live.columns <= 0 ||
    live.rows <= 0 ||
    live.cellWidth <= 0 ||
    live.cellHeight <= 0
  ) {
    return undefined;
  }
  return {
    originX: live.originX,
    originY: live.originY,
    cellWidth: live.cellWidth,
    cellHeight: live.cellHeight,
    columns: live.columns,
    rows: live.rows,
  };
}

function leftoverLeftPlaceholder(
  grid: GridGeometry,
  frameWidth: number,
): boolean {
  return frameWidth >= 1280 && grid.originX < frameWidth / 2;
}

/**
 * Grids used by StashController click/drag math. The dry-run overlay must
 * render these same rects. A captured frame uses the PoE 2 stash-left /
 * bag-right layout; leftover DEFAULT (100,500) flags on a wide capture are
 * replaced so the bag cannot sit on the waypoint.
 */
export function resolveStashPlannerGrids(
  world?: {
    flags?: Pick<
      WorldStateFlags,
      "liveInventoryGrid" | "liveStashGrid" | "liveFrameWidth" | "liveFrameHeight"
    >;
  },
): { inventory: GridGeometry; stash: GridGeometry } {
  const frameWidth = world?.flags?.liveFrameWidth;
  const frameHeight = world?.flags?.liveFrameHeight;
  const hasFrame =
    typeof frameWidth === "number" &&
    frameWidth > 0 &&
    typeof frameHeight === "number" &&
    frameHeight > 0;
  const layout = hasFrame ? layoutPoe2OpenStashBagGrids(frameWidth, frameHeight) : undefined;
  const liveInventory = geometryFromLiveFlag(world?.flags?.liveInventoryGrid);
  const liveStash = geometryFromLiveFlag(world?.flags?.liveStashGrid);

  if (
    layout !== undefined &&
    liveInventory !== undefined &&
    typeof frameWidth === "number" &&
    leftoverLeftPlaceholder(liveInventory, frameWidth)
  ) {
    return layout;
  }
  if (liveInventory !== undefined && liveStash !== undefined) {
    return { inventory: liveInventory, stash: liveStash };
  }
  if (layout !== undefined) {
    return {
      inventory: liveInventory ?? layout.inventory,
      stash: liveStash ?? layout.stash,
    };
  }
  return {
    inventory: liveInventory ?? DEFAULT_INVENTORY_GRID,
    stash: liveStash ?? DEFAULT_STASH_GRID,
  };
}
