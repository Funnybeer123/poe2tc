import type { InputAction } from "../input/types.js";
import type { GridGeometry } from "../inventory/gridGeometry.js";
import {
  DEFAULT_INVENTORY_GRID,
  DEFAULT_STASH_GRID,
  resolveStashPlannerGrids,
} from "../stash/geometry.js";
import type { PixelPoint, RuntimeMode, WorldState } from "../world-state/types.js";

export const CALIBRATION_OVERLAY_TICK_MS = 250;

export type CalibrationOverlayReason =
  | "dry-run"
  | "public-mode"
  | "not-armed"
  | "live-execute"
  | "emergency-stop";

export interface CalibrationCellRect {
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
  row: number;
}

export interface CalibrationGridPanel {
  role: "inventory" | "stash";
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  placeholder: boolean;
  cells: CalibrationCellRect[];
}

export interface CalibrationClickDot {
  kind: "click" | "drag-from" | "drag-to";
  x: number;
  y: number;
}

export interface CalibrationDragArrow {
  from: PixelPoint;
  to: PixelPoint;
}

export interface DryRunCalibrationOverlay {
  visible: boolean;
  reason: CalibrationOverlayReason;
  frameWidth: number;
  frameHeight: number;
  inventory: CalibrationGridPanel;
  stash: CalibrationGridPanel;
  clicks: CalibrationClickDot[];
  drags: CalibrationDragArrow[];
}

export interface PublishDryRunCalibrationInput {
  mode: RuntimeMode;
  canEmitNativeInput: boolean;
  armed: boolean;
  dryRunDefault: boolean;
  emergencyStopLatched: boolean;
  world?: Pick<WorldState, "flags">;
  intendedActions?: readonly InputAction[];
}

function emptyPanel(role: "inventory" | "stash"): CalibrationGridPanel {
  return {
    role,
    originX: 0,
    originY: 0,
    cellWidth: 0,
    cellHeight: 0,
    columns: 0,
    rows: 0,
    placeholder: false,
    cells: [],
  };
}

export function hiddenCalibrationOverlay(
  reason: Exclude<CalibrationOverlayReason, "dry-run">,
): DryRunCalibrationOverlay {
  return {
    visible: false,
    reason,
    frameWidth: 0,
    frameHeight: 0,
    inventory: emptyPanel("inventory"),
    stash: emptyPanel("stash"),
    clicks: [],
    drags: [],
  };
}

export function isDefaultPlaceholderGrid(
  grid: GridGeometry,
  role: "inventory" | "stash",
): boolean {
  const expected = role === "inventory" ? DEFAULT_INVENTORY_GRID : DEFAULT_STASH_GRID;
  return (
    grid.originX === expected.originX &&
    grid.originY === expected.originY &&
    grid.cellWidth === expected.cellWidth &&
    grid.cellHeight === expected.cellHeight &&
    grid.columns === expected.columns &&
    grid.rows === expected.rows
  );
}

export function gridPanelFromGeometry(
  grid: GridGeometry,
  role: "inventory" | "stash",
): CalibrationGridPanel {
  const cells: CalibrationCellRect[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      cells.push({
        x: grid.originX + column * grid.cellWidth,
        y: grid.originY + row * grid.cellHeight,
        width: grid.cellWidth,
        height: grid.cellHeight,
        column,
        row,
      });
    }
  }
  return {
    role,
    originX: grid.originX,
    originY: grid.originY,
    cellWidth: grid.cellWidth,
    cellHeight: grid.cellHeight,
    columns: grid.columns,
    rows: grid.rows,
    placeholder: isDefaultPlaceholderGrid(grid, role),
    cells,
  };
}

export function marksFromIntendedActions(actions: readonly InputAction[]): {
  clicks: CalibrationClickDot[];
  drags: CalibrationDragArrow[];
} {
  const clicks: CalibrationClickDot[] = [];
  const drags: CalibrationDragArrow[] = [];
  for (const action of actions) {
    if (action.type === "mouse-click") {
      clicks.push({ kind: "click", x: action.x, y: action.y });
    } else if (action.type === "mouse-drag") {
      clicks.push({ kind: "drag-from", x: action.from.x, y: action.from.y });
      clicks.push({ kind: "drag-to", x: action.to.x, y: action.to.y });
      drags.push({ from: { ...action.from }, to: { ...action.to } });
    }
  }
  return { clicks, drags };
}

export function publishDryRunCalibrationOverlay(
  input: PublishDryRunCalibrationInput,
): DryRunCalibrationOverlay {
  if (input.mode !== "authorized-qa" || input.canEmitNativeInput !== true) {
    return hiddenCalibrationOverlay("public-mode");
  }
  if (input.emergencyStopLatched) {
    return hiddenCalibrationOverlay("emergency-stop");
  }
  if (!input.armed) {
    return hiddenCalibrationOverlay("not-armed");
  }
  if (!input.dryRunDefault) {
    return hiddenCalibrationOverlay("live-execute");
  }

  const grids = resolveStashPlannerGrids(input.world);
  const marks = marksFromIntendedActions(input.intendedActions ?? []);
  const frameWidth = input.world?.flags.liveFrameWidth;
  const frameHeight = input.world?.flags.liveFrameHeight;
  return {
    visible: true,
    reason: "dry-run",
    frameWidth: typeof frameWidth === "number" && frameWidth > 0 ? frameWidth : 1920,
    frameHeight: typeof frameHeight === "number" && frameHeight > 0 ? frameHeight : 1080,
    inventory: gridPanelFromGeometry(grids.inventory, "inventory"),
    stash: gridPanelFromGeometry(grids.stash, "stash"),
    clicks: marks.clicks,
    drags: marks.drags,
  };
}
