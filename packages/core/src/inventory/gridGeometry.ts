export const REFERENCE_FRAME_WIDTH = 1920;
export const REFERENCE_FRAME_HEIGHT = 1080;

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
