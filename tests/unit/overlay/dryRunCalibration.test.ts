import {
  cellCenter,
  createEmptyWorldState,
  DEFAULT_INVENTORY_GRID,
  DEFAULT_STASH_GRID,
  publishDryRunCalibrationOverlay,
  resolveStashPlannerGrids,
  StashController,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";
import { createTestScenario } from "../../helpers/createTestScenario.js";
import { createStashWorld, inventoryCells, stashCells } from "../../helpers/stashWorld.js";

const DRAG = {
  type: "mouse-drag" as const,
  from: cellCenter({ x: 0, y: 0, w: 1, h: 1 }, DEFAULT_INVENTORY_GRID),
  to: cellCenter({ x: 7, y: 0, w: 1, h: 1 }, DEFAULT_STASH_GRID),
  button: "left" as const,
};

describe("publishDryRunCalibrationOverlay", () => {
  it("publishes planner grid rects and intended click/drag points in QA dry-run", () => {
    const world = createEmptyWorldState();
    const overlay = publishDryRunCalibrationOverlay({
      mode: "authorized-qa",
      canEmitNativeInput: true,
      armed: true,
      dryRunDefault: true,
      emergencyStopLatched: false,
      world,
      intendedActions: [DRAG],
    });

    expect(overlay.visible).toBe(true);
    expect(overlay.reason).toBe("dry-run");
    expect(overlay.inventory.cells).toHaveLength(60);
    expect(overlay.stash.cells).toHaveLength(144);
    expect(overlay.inventory.originX).toBe(DEFAULT_INVENTORY_GRID.originX);
    expect(overlay.inventory.originY).toBe(DEFAULT_INVENTORY_GRID.originY);
    expect(overlay.inventory.placeholder).toBe(true);
    expect(overlay.stash.placeholder).toBe(true);
    expect(overlay.inventory.cells[0]).toMatchObject({
      x: 100,
      y: 500,
      width: 50,
      height: 50,
      column: 0,
      row: 0,
    });
    expect(overlay.clicks).toEqual([
      { kind: "drag-from", x: DRAG.from.x, y: DRAG.from.y },
      { kind: "drag-to", x: DRAG.to.x, y: DRAG.to.y },
    ]);
    expect(overlay.drags).toEqual([{ from: DRAG.from, to: DRAG.to }]);
    expect(DRAG.from).toEqual({ x: 125, y: 525 });
  });

  it("uses the same coordinates the stash planner emits", () => {
    const world = createStashWorld((next) => {
      next.inventory = {
        value: {
          occupied: 1,
          capacity: 4,
          full: false,
          cells: inventoryCells([{ x: 0, y: 0, fingerprint: "divine-1" }]),
        },
        confidence: 0.95,
        observedAtMs: 10_000,
        freshness: "fresh",
      };
      next.stash = {
        value: { tabId: "currency", tabName: "Currency", cells: stashCells("currency"), tabFull: false },
        confidence: 0.9,
        observedAtMs: 10_000,
        freshness: "fresh",
      };
    });
    const decision = new StashController().decide(world, createTestScenario());
    const drag = decision.intendedActions.find((action) => action.type === "mouse-drag");
    expect(drag?.type).toBe("mouse-drag");
    if (drag?.type !== "mouse-drag") {
      return;
    }
    const grids = resolveStashPlannerGrids(world);
    expect(drag.from).toEqual(cellCenter({ x: 0, y: 0, w: 1, h: 1 }, grids.inventory));
    const overlay = publishDryRunCalibrationOverlay({
      mode: "authorized-qa",
      canEmitNativeInput: true,
      armed: true,
      dryRunDefault: true,
      emergencyStopLatched: false,
      world,
      intendedActions: decision.intendedActions,
    });
    expect(overlay.drags[0]).toEqual({ from: drag.from, to: drag.to });
    expect(overlay.inventory.originX).toBe(grids.inventory.originX);
    expect(overlay.stash.originX).toBe(grids.stash.originX);
  });

  it("publishes none in public companion", () => {
    const overlay = publishDryRunCalibrationOverlay({
      mode: "public-companion",
      canEmitNativeInput: false,
      armed: true,
      dryRunDefault: true,
      emergencyStopLatched: false,
      intendedActions: [DRAG],
    });
    expect(overlay.visible).toBe(false);
    expect(overlay.reason).toBe("public-mode");
    expect(overlay.inventory.cells).toEqual([]);
    expect(overlay.stash.cells).toEqual([]);
    expect(overlay.clicks).toEqual([]);
    expect(overlay.drags).toEqual([]);
  });

  it("stays hidden in live execute so the loop does not require the overlay", () => {
    const overlay = publishDryRunCalibrationOverlay({
      mode: "authorized-qa",
      canEmitNativeInput: true,
      armed: true,
      dryRunDefault: false,
      emergencyStopLatched: false,
      intendedActions: [DRAG],
    });
    expect(overlay.visible).toBe(false);
    expect(overlay.reason).toBe("live-execute");
    expect(overlay.clicks).toEqual([]);
    expect(overlay.drags).toEqual([]);
  });

  it("shows live detector grids when those are the planner source", () => {
    const world = createEmptyWorldState();
    world.flags.liveInventoryGrid = {
      originX: 1040,
      originY: 650,
      cellWidth: 68,
      cellHeight: 68,
      columns: 12,
      rows: 5,
      occupied: 1,
      capacity: 60,
      full: false,
    };
    world.flags.liveStashGrid = {
      originX: 80,
      originY: 180,
      cellWidth: 68,
      cellHeight: 68,
      columns: 12,
      rows: 12,
    };
    world.flags.liveFrameWidth = 1920;
    world.flags.liveFrameHeight = 1080;
    const grids = resolveStashPlannerGrids(world);
    const overlay = publishDryRunCalibrationOverlay({
      mode: "authorized-qa",
      canEmitNativeInput: true,
      armed: true,
      dryRunDefault: true,
      emergencyStopLatched: false,
      world,
      intendedActions: [
        {
          type: "mouse-drag",
          from: cellCenter({ x: 0, y: 0, w: 2, h: 4 }, grids.inventory),
          to: cellCenter({ x: 0, y: 0, w: 1, h: 1 }, grids.stash),
          button: "left",
        },
      ],
    });
    expect(overlay.inventory.placeholder).toBe(false);
    expect(overlay.inventory.originX).toBe(1040);
    expect(overlay.stash.originX).toBe(80);
    expect(overlay.inventory.cellWidth).toBe(68);
    expect(overlay.frameWidth).toBe(1920);
    expect(overlay.clicks[0]).toEqual({ kind: "drag-from", x: 1074, y: 684 });
  });
});
