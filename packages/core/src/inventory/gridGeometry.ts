export const REFERENCE_FRAME_WIDTH = 1920;
export const REFERENCE_FRAME_HEIGHT = 1080;
export const POE2_INVENTORY_COLUMNS = 12;
export const POE2_INVENTORY_ROWS = 5;
export const POE2_STASH_COLUMNS = 12;
export const POE2_STASH_ROWS = 12;

export interface GridGeometry {
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  tabId?: string;
}

export function scaleGridGeometry(
  geometry: GridGeometry,
  scaleX: number,
  scaleY: number = scaleX,
): GridGeometry {
  if (scaleX === 1 && scaleY === 1) {
    return geometry;
  }
  return {
    ...geometry,
    originX: Math.round(geometry.originX * scaleX),
    originY: Math.round(geometry.originY * scaleY),
    cellWidth: Math.max(1, Math.round(geometry.cellWidth * scaleX)),
    cellHeight: Math.max(1, Math.round(geometry.cellHeight * scaleY)),
  };
}

/** Default bag/stash placeholders are authored in 1920x1080 logical pixels. */
export function isReferenceLayoutGrid(geometry: GridGeometry): boolean {
  return (
    geometry.cellWidth === 50 &&
    geometry.cellHeight === 50 &&
    geometry.columns === 12 &&
    (geometry.rows === 5 || geometry.rows === 12)
  );
}

export function scaleReferenceGridToFrame(
  geometry: GridGeometry,
  frameWidth: number,
  frameHeight: number,
): GridGeometry {
  if (!isReferenceLayoutGrid(geometry) || frameWidth <= 0 || frameHeight <= 0) {
    return geometry;
  }
  return scaleGridGeometry(
    geometry,
    frameWidth / REFERENCE_FRAME_WIDTH,
    frameHeight / REFERENCE_FRAME_HEIGHT,
  );
}

/**
 * PoE 2 windowed stash+bag: tab list then 12x12 stash on the left, 12x5
 * backpack on the bottom-right under the equipment doll. Cell size is shared
 * and scaled from the right-third backpack width so the bag cannot cover the
 * waypoint / frame center.
 */
export function layoutPoe2OpenStashBagGrids(
  frameWidth: number,
  frameHeight: number,
): { inventory: GridGeometry; stash: GridGeometry } {
  const width = Math.max(1, Math.round(frameWidth));
  const height = Math.max(1, Math.round(frameHeight));
  const rightInset = Math.max(12, Math.round(width * 0.038));
  const bottomInset = Math.max(16, Math.round(height * 0.115));
  const tabListWidth = Math.max(24, Math.round(width * 0.108));
  const rightThird = (2 * width) / 3;
  const bagRight = width - rightInset;
  const maxBagWidth = Math.max(POE2_INVENTORY_COLUMNS, Math.floor(bagRight - rightThird));
  const cell = Math.max(8, Math.floor(maxBagWidth / POE2_INVENTORY_COLUMNS));
  const bagWidth = cell * POE2_INVENTORY_COLUMNS;
  const inventoryOriginX = bagRight - bagWidth;
  const inventoryOriginY = Math.max(0, height - bottomInset - cell * POE2_INVENTORY_ROWS);
  const stashOriginX = tabListWidth;
  const stashOriginY = Math.max(0, height - bottomInset - cell * POE2_STASH_ROWS);
  return {
    inventory: {
      originX: inventoryOriginX,
      originY: inventoryOriginY,
      cellWidth: cell,
      cellHeight: cell,
      columns: POE2_INVENTORY_COLUMNS,
      rows: POE2_INVENTORY_ROWS,
    },
    stash: {
      originX: stashOriginX,
      originY: stashOriginY,
      cellWidth: cell,
      cellHeight: cell,
      columns: POE2_STASH_COLUMNS,
      rows: POE2_STASH_ROWS,
    },
  };
}

export function gridRectContainsPoint(
  grid: GridGeometry,
  x: number,
  y: number,
): boolean {
  return (
    x >= grid.originX &&
    x < grid.originX + grid.cellWidth * grid.columns &&
    y >= grid.originY &&
    y < grid.originY + grid.cellHeight * grid.rows
  );
}

/** Replace DEFAULT 12x5 / 12x12 placeholders with frame-derived PoE 2 panels. */
export function resolveDetectorGrid(
  hint: GridGeometry,
  frameWidth: number,
  frameHeight: number,
): GridGeometry {
  if (!isReferenceLayoutGrid(hint) || frameWidth <= 0 || frameHeight <= 0) {
    return hint;
  }
  const layout = layoutPoe2OpenStashBagGrids(frameWidth, frameHeight);
  const resolved = hint.rows >= POE2_STASH_ROWS ? layout.stash : layout.inventory;
  return hint.tabId === undefined ? resolved : { ...resolved, tabId: hint.tabId };
}

export interface GridHover {
  kind: "inventory" | "stash";
  x: number;
  y: number;
  clipboardText?: string;
}

export interface GridDetectionHints {
  inventoryGrid?: GridGeometry;
  stashGrid?: GridGeometry;
  hover?: GridHover;
  gridHover?: GridHover;
}
