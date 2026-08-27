import {
  DEFAULT_INVENTORY_GRID,
  createEmptyWorldState,
  gridRectContainsPoint,
  layoutPoe2OpenStashBagGrids,
  resolveStashPlannerGrids,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";

function expectOpenStashBagLayout(width: number, height: number): void {
  const layout = layoutPoe2OpenStashBagGrids(width, height);
  expect(layout.stash.originX).toBeLessThan(width / 3);
  expect(layout.inventory.originX).toBeGreaterThan((2 * width) / 3);
  expect(layout.stash.columns).toBe(12);
  expect(layout.stash.rows).toBe(12);
  expect(layout.inventory.columns).toBe(12);
  expect(layout.inventory.rows).toBe(5);
  expect(layout.inventory.cellWidth).toBe(layout.stash.cellWidth);
  expect(
    gridRectContainsPoint(layout.inventory, width / 2, height / 2),
  ).toBe(false);
  expect(layout.inventory.originX).not.toBe(100);
  expect(layout.inventory.originY).not.toBe(500);
}

describe("layoutPoe2OpenStashBagGrids", () => {
  it("places stash left 12x12 and bag right 12x5 on a 1920x1080 frame", () => {
    expectOpenStashBagLayout(1920, 1080);
  });

  it("keeps the same left/right split on other 16:9 frames", () => {
    expectOpenStashBagLayout(1280, 720);
    expectOpenStashBagLayout(2560, 1440);
    expectOpenStashBagLayout(2880, 1620);
  });

  it("cannot place a 1920-wide bag grid over the waypoint / screen center", () => {
    const world = createEmptyWorldState();
    world.flags.liveFrameWidth = 1920;
    world.flags.liveFrameHeight = 1080;
    world.flags.liveInventoryGrid = {
      ...DEFAULT_INVENTORY_GRID,
      occupied: 1,
      capacity: 60,
      full: false,
    };
    const grids = resolveStashPlannerGrids(world);
    expect(grids.inventory.originX).toBeGreaterThan((2 * 1920) / 3);
    expect(gridRectContainsPoint(grids.inventory, 960, 540)).toBe(false);
    expect(grids.stash.rows).toBe(12);
    expect(grids.inventory.rows).toBe(5);
    expect(grids.stash.originX).toBeLessThan(1920 / 3);
  });
});
