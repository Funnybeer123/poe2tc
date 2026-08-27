import type { GridDetectionHints, GridGeometry, GridHover } from "../inventory/gridGeometry.js";
import { scaleReferenceGridToFrame } from "../inventory/gridGeometry.js";
import { occupancyFromCells, stashTabFull } from "../inventory/occupancy.js";
import { parseItem } from "../items/parseItem.js";
import type { GridCell, Observation, WorldState } from "../world-state/types.js";
import type { RgbaImage } from "./templateMatch.js";
import type { PerceptionFrameInput } from "./types.js";

export type { GridDetectionHints, GridGeometry, GridHover };

export interface DetectedGrids {
  inventory?: WorldState["inventory"]["value"];
  stash?: WorldState["stash"]["value"];
  inventoryGrid?: GridGeometry;
  stashGrid?: GridGeometry;
  source: "fixture" | "pixels" | "empty";
  evidenceId?: string;
}

export interface GridDetectorOptions extends GridDetectionHints {
  emptyColor?: readonly [number, number, number];
  occupiedDistance?: number;
  occupiedVoteRatio?: number;
}

export const DEFAULT_EMPTY_CELL_COLOR = [28, 28, 36] as const;
/** Dark default plus blue/red bag tints used by PoE 2 multi-bag chrome. */
export const EMPTY_BAG_CHROME_COLORS = [
  DEFAULT_EMPTY_CELL_COLOR,
  [24, 36, 72],
  [36, 48, 88],
  [72, 28, 32],
  [88, 36, 40],
  [40, 32, 48],
] as const;
export const DEFAULT_OCCUPIED_DISTANCE = 40;
export const DEFAULT_OCCUPIED_VOTE_RATIO = 0.45;

function isObservation(value: unknown): value is Observation<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "value" in value && "confidence" in value && "observedAtMs" in value;
}

function inventoryFromDerived(
  derived: Partial<WorldState> | undefined,
): WorldState["inventory"]["value"] | undefined {
  const raw = derived?.inventory as unknown;
  if (raw === undefined) {
    return undefined;
  }
  if (isObservation(raw)) {
    return raw.value as WorldState["inventory"]["value"];
  }
  return raw as WorldState["inventory"]["value"];
}

function stashFromDerived(derived: Partial<WorldState> | undefined): WorldState["stash"]["value"] | undefined {
  const raw = derived?.stash as unknown;
  if (raw === undefined) {
    return undefined;
  }
  if (isObservation(raw)) {
    return raw.value as WorldState["stash"]["value"];
  }
  return raw as WorldState["stash"]["value"];
}

export function gridHintsFromDerived(derived: unknown): GridDetectionHints {
  if (typeof derived !== "object" || derived === null) {
    return {};
  }
  const record = derived as Record<string, unknown>;
  return {
    inventoryGrid: record.inventoryGrid as GridGeometry | undefined,
    stashGrid: record.stashGrid as GridGeometry | undefined,
    hover: (record.hover ?? record.gridHover) as GridHover | undefined,
  };
}

function fingerprintFromClipboard(text: string | undefined, capturedAtMs: number): string | undefined {
  if (text === undefined || text.trim().length === 0) {
    return undefined;
  }
  const parsed = parseItem({ rawText: text, source: "clipboard", capturedAtMs });
  return parsed.ok ? parsed.item.fingerprint : undefined;
}

function applyHoverFingerprint(
  kind: "inventory" | "stash",
  cells: GridCell[],
  hover: GridHover | undefined,
  capturedAtMs: number,
): GridCell[] {
  if (hover === undefined || hover.kind !== kind) {
    return cells;
  }
  const fingerprint = fingerprintFromClipboard(hover.clipboardText, capturedAtMs);
  if (fingerprint === undefined) {
    return cells;
  }
  return cells.map((cell) => {
    if (cell.x !== hover.x || cell.y !== hover.y) {
      return cell;
    }
    return { ...cell, occupied: true, itemFingerprint: fingerprint };
  });
}

function colorDistance(r: number, g: number, b: number, empty: readonly [number, number, number]): number {
  return Math.hypot(r - empty[0], g - empty[1], b - empty[2]);
}

export function isEmptyBagChrome(
  r: number,
  g: number,
  b: number,
  empty: readonly [number, number, number] = DEFAULT_EMPTY_CELL_COLOR,
  occupiedDistance: number = DEFAULT_OCCUPIED_DISTANCE,
): boolean {
  if (colorDistance(r, g, b, empty) <= occupiedDistance) {
    return true;
  }
  for (const chrome of EMPTY_BAG_CHROME_COLORS) {
    if (colorDistance(r, g, b, chrome) <= occupiedDistance) {
      return true;
    }
  }
  const lum = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return lum <= 90 && sat <= 70 && lum >= 8;
}

function fillOccupiedHoles(cells: GridCell[], columns: number, rows: number): GridCell[] {
  if (columns <= 0 || rows <= 0 || cells.length === 0) {
    return cells;
  }
  const occupied = cells.map((cell) => cell.occupied);
  const indexAt = (x: number, y: number): number => y * columns + x;
  let changed = true;
  for (let pass = 0; pass < 3 && changed; pass += 1) {
    changed = false;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const index = indexAt(x, y);
        if (occupied[index] === true) {
          continue;
        }
        let neighbors = 0;
        if (x > 0 && occupied[indexAt(x - 1, y)] === true) {
          neighbors += 1;
        }
        if (x + 1 < columns && occupied[indexAt(x + 1, y)] === true) {
          neighbors += 1;
        }
        if (y > 0 && occupied[indexAt(x, y - 1)] === true) {
          neighbors += 1;
        }
        if (y + 1 < rows && occupied[indexAt(x, y + 1)] === true) {
          neighbors += 1;
        }
        if (neighbors >= 3) {
          occupied[index] = true;
          changed = true;
        }
      }
    }
  }
  return cells.map((cell, index) =>
    occupied[index] === true && cell.occupied !== true ? { ...cell, occupied: true } : cell,
  );
}

function cellOccupiedFromPixels(
  image: RgbaImage,
  geometry: GridGeometry,
  column: number,
  row: number,
  empty: readonly [number, number, number],
  occupiedDistance: number,
  voteRatio: number,
): boolean {
  const x0 = geometry.originX + column * geometry.cellWidth;
  const y0 = geometry.originY + row * geometry.cellHeight;
  const insetX = Math.max(1, Math.floor(geometry.cellWidth * 0.2));
  const insetY = Math.max(1, Math.floor(geometry.cellHeight * 0.2));
  let votes = 0;
  let count = 0;
  for (let y = y0 + insetY; y < y0 + geometry.cellHeight - insetY; y += 1) {
    if (y < 0 || y >= image.height) {
      continue;
    }
    for (let x = x0 + insetX; x < x0 + geometry.cellWidth - insetX; x += 1) {
      if (x < 0 || x >= image.width) {
        continue;
      }
      const offset = (y * image.width + x) * 4;
      if (
        !isEmptyBagChrome(
          image.pixels[offset] ?? 0,
          image.pixels[offset + 1] ?? 0,
          image.pixels[offset + 2] ?? 0,
          empty,
          occupiedDistance,
        )
      ) {
        votes += 1;
      }
      count += 1;
    }
  }
  if (count === 0) {
    return false;
  }
  return votes / count >= voteRatio;
}

function detectCellsFromPixels(
  image: RgbaImage,
  geometry: GridGeometry,
  options: GridDetectorOptions,
): GridCell[] {
  const cells: GridCell[] = [];
  for (let y = 0; y < geometry.rows; y += 1) {
    for (let x = 0; x < geometry.columns; x += 1) {
      const occupied = cellOccupiedFromPixels(
        image,
        geometry,
        x,
        y,
        options.emptyColor ?? DEFAULT_EMPTY_CELL_COLOR,
        options.occupiedDistance ?? DEFAULT_OCCUPIED_DISTANCE,
        options.occupiedVoteRatio ?? DEFAULT_OCCUPIED_VOTE_RATIO,
      );
      cells.push({
        tabId: geometry.tabId,
        x,
        y,
        w: 1,
        h: 1,
        occupied,
      });
    }
  }
  return fillOccupiedHoles(cells, geometry.columns, geometry.rows);
}

function mergeFingerprints(detected: GridCell[], known: GridCell[] | undefined): GridCell[] {
  if (known === undefined || known.length === 0) {
    return detected;
  }
  const byKey = new Map(known.map((cell) => [`${String(cell.x)}:${String(cell.y)}`, cell]));
  return detected.map((cell) => {
    const prior = byKey.get(`${String(cell.x)}:${String(cell.y)}`);
    if (prior?.itemFingerprint === undefined) {
      return cell;
    }
    return { ...cell, occupied: true, itemFingerprint: prior.itemFingerprint };
  });
}

export function detectGrids(
  frame: PerceptionFrameInput,
  options: GridDetectorOptions = {},
): DetectedGrids {
  const derivedInventory = inventoryFromDerived(frame.derived);
  const derivedStash = stashFromDerived(frame.derived);
  const hints = { ...gridHintsFromDerived(frame.derived), ...options };
  const hover = hints.hover;

  const fixtureInventoryCells = derivedInventory?.cells ?? [];
  const fixtureStashCells = derivedStash?.cells ?? [];
  const hasFixtureCells = fixtureInventoryCells.length > 0 || fixtureStashCells.length > 0;

  if (hasFixtureCells) {
    const inventoryCells = applyHoverFingerprint(
      "inventory",
      fixtureInventoryCells,
      hover,
      frame.capturedAtMs,
    );
    const stashCells = applyHoverFingerprint("stash", fixtureStashCells, hover, frame.capturedAtMs);
    return {
      inventory:
        derivedInventory === undefined
          ? undefined
          : {
              ...occupancyFromCells(inventoryCells, derivedInventory),
              cells: inventoryCells,
            },
      stash:
        derivedStash === undefined
          ? undefined
          : {
              ...derivedStash,
              cells: stashCells,
              tabFull: stashTabFull(stashCells, derivedStash.tabFull),
            },
      source: "fixture",
      evidenceId: `grid-fixture:${String(frame.tickId)}`,
    };
  }

  const hasPixels =
    frame.pixels !== undefined && frame.pixels.length >= frame.width * frame.height * 4;
  if (!hasPixels || (hints.inventoryGrid === undefined && hints.stashGrid === undefined)) {
    if (derivedInventory !== undefined || derivedStash !== undefined) {
      return {
        inventory: derivedInventory,
        stash: derivedStash,
        source: "fixture",
        evidenceId: `grid-derived:${String(frame.tickId)}`,
      };
    }
    return { source: "empty" };
  }

  const image: RgbaImage = {
    width: frame.width,
    height: frame.height,
    pixels: frame.pixels ?? new Uint8Array(),
  };

  let inventory: WorldState["inventory"]["value"] | undefined;
  const inventoryGrid =
    hints.inventoryGrid === undefined
      ? undefined
      : scaleReferenceGridToFrame(hints.inventoryGrid, frame.width, frame.height);
  if (inventoryGrid !== undefined) {
    const cells = applyHoverFingerprint(
      "inventory",
      mergeFingerprints(detectCellsFromPixels(image, inventoryGrid, options), derivedInventory?.cells),
      hover,
      frame.capturedAtMs,
    );
    inventory = occupancyFromCells(cells, {
      ...derivedInventory,
      stashOpen: hints.stashGrid !== undefined,
    });
  }

  let stash: WorldState["stash"]["value"] | undefined;
  const stashGrid =
    hints.stashGrid === undefined
      ? undefined
      : scaleReferenceGridToFrame(hints.stashGrid, frame.width, frame.height);
  if (stashGrid !== undefined) {
    const cells = applyHoverFingerprint(
      "stash",
      mergeFingerprints(detectCellsFromPixels(image, stashGrid, options), derivedStash?.cells),
      hover,
      frame.capturedAtMs,
    );
    stash = {
      tabId: derivedStash?.tabId ?? hints.stashGrid.tabId,
      tabName: derivedStash?.tabName,
      cells,
      tabFull: stashTabFull(cells, derivedStash?.tabFull),
    };
  }

  return {
    inventory,
    stash,
    inventoryGrid,
    stashGrid,
    source: "pixels",
    evidenceId: `grid-pixels:${String(frame.tickId)}`,
  };
}

export class GridDetector {
  readonly #options: GridDetectorOptions;

  constructor(options: GridDetectorOptions = {}) {
    this.#options = options;
  }

  detect(frame: PerceptionFrameInput): DetectedGrids {
    return detectGrids(frame, this.#options);
  }
}

export function createGridDetector(options: GridDetectorOptions = {}): GridDetector {
  return new GridDetector(options);
}
