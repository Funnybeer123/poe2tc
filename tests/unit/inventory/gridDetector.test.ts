import { readFileSync } from "node:fs";
import {
  detectGrids,
  occupancyFromCells,
  parseItem,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";
import { createRgba, fillRect } from "../../helpers/encodePng.js";
import { itemFixturePath } from "../../helpers/fixturePaths.js";
import { INVENTORY_COLUMNS, INVENTORY_ROWS } from "../../helpers/gridCells.js";

const GEOMETRY = {
  originX: 0,
  originY: 0,
  cellWidth: 16,
  cellHeight: 16,
  columns: INVENTORY_COLUMNS,
  rows: INVENTORY_ROWS,
};

function occupiedGridPixels(occupied: Array<readonly [number, number]>): Uint8Array {
  const pixels = createRgba(64, 48, [28, 28, 36, 255]);
  for (const [x, y] of occupied) {
    fillRect(pixels, 64, x * 16, y * 16, 16, 16, [200, 160, 50, 255]);
  }
  return pixels;
}

describe("gridDetector", () => {
  it("uses fixture cells when present and does not invent fingerprints", () => {
    const detected = detectGrids({
      tickId: 1,
      capturedAtMs: 10_000,
      width: 64,
      height: 48,
      derived: {
        inventory: {
          value: {
            occupied: 1,
            capacity: 12,
            full: false,
            cells: [{ x: 0, y: 0, w: 1, h: 1, occupied: true }],
          },
          confidence: 1,
          observedAtMs: 10_000,
          freshness: "fresh",
        },
      },
    });
    expect(detected.source).toBe("fixture");
    expect(detected.inventory?.occupied).toBe(1);
    expect(detected.inventory?.cells[0]?.itemFingerprint).toBeUndefined();
  });

  it("fills occupancy from pixel geometry without inventing item identities", () => {
    const detected = detectGrids(
      {
        tickId: 1,
        capturedAtMs: 10_000,
        width: 64,
        height: 48,
        pixels: occupiedGridPixels([
          [0, 0],
          [1, 0],
          [2, 0],
        ]),
      },
      { inventoryGrid: GEOMETRY },
    );
    expect(detected.source).toBe("pixels");
    expect(detected.inventory?.occupied).toBe(3);
    expect(detected.inventory?.capacity).toBe(12);
    expect(detected.inventory?.full).toBe(false);
    expect(detected.inventory?.cells.every((cell) => cell.itemFingerprint === undefined)).toBe(true);
  });

  it("applies clipboard hover fingerprints only to the hovered cell", () => {
    const rawText = readFileSync(itemFixturePath("currency-divine.txt"), "utf8");
    const parsed = parseItem({ rawText, source: "clipboard", capturedAtMs: 10_000 });
    expect(parsed.ok).toBe(true);
    const detected = detectGrids({
      tickId: 1,
      capturedAtMs: 10_000,
      width: 64,
      height: 48,
      derived: {
        inventory: {
          value: {
            occupied: 2,
            capacity: 12,
            full: false,
            cells: [
              { x: 0, y: 0, w: 1, h: 1, occupied: true },
              { x: 1, y: 0, w: 1, h: 1, occupied: true },
            ],
          },
          confidence: 1,
          observedAtMs: 10_000,
          freshness: "fresh",
        },
        gridHover: {
          kind: "inventory",
          x: 0,
          y: 0,
          clipboardText: rawText,
        },
      },
    });
    expect(parsed.ok && detected.inventory?.cells[0]?.itemFingerprint).toBe(
      parsed.ok ? parsed.item.fingerprint : undefined,
    );
    expect(detected.inventory?.cells[1]?.itemFingerprint).toBeUndefined();
  });

  it("computes full from a completely occupied detected grid", () => {
    const occupied: Array<readonly [number, number]> = [];
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        occupied.push([x, y]);
      }
    }
    const detected = detectGrids(
      {
        tickId: 2,
        capturedAtMs: 10_000,
        width: 64,
        height: 48,
        pixels: occupiedGridPixels(occupied),
      },
      { inventoryGrid: GEOMETRY },
    );
    expect(occupancyFromCells(detected.inventory?.cells ?? []).full).toBe(true);
  });

  it("treats blue and red bag chrome as empty and a packed 12x5 2x4 bag as full", async () => {
    const { DEFAULT_INVENTORY_GRID, DEFAULT_STASH_GRID } = await import("@poe2tc/core");
    const { createPackedMultiCellBagPixels } = await import("../../helpers/liveGridFrame.js");
    const detected = detectGrids(
      {
        tickId: 3,
        capturedAtMs: 10_000,
        width: 1920,
        height: 1080,
        pixels: createPackedMultiCellBagPixels(),
      },
      {
        inventoryGrid: DEFAULT_INVENTORY_GRID,
        stashGrid: { ...DEFAULT_STASH_GRID, tabId: "dump" },
      },
    );
    expect(detected.inventory?.occupied).toBe(60);
    expect(detected.inventory?.capacity).toBe(60);
    expect(detected.inventory?.full).toBe(true);
    expect(detected.inventory?.cells).toHaveLength(60);
  });

  it("replaces the 12x5 placeholder with a right-side bag on a 1.5 device-scale capture", async () => {
    const { DEFAULT_INVENTORY_GRID, DEFAULT_STASH_GRID, layoutPoe2OpenStashBagGrids } = await import(
      "@poe2tc/core"
    );
    const { createPackedMultiCellBagPixels } = await import("../../helpers/liveGridFrame.js");
    const detected = detectGrids(
      {
        tickId: 4,
        capturedAtMs: 10_000,
        width: 2880,
        height: 1620,
        pixels: createPackedMultiCellBagPixels(1.5),
      },
      {
        inventoryGrid: DEFAULT_INVENTORY_GRID,
        stashGrid: { ...DEFAULT_STASH_GRID, tabId: "dump" },
      },
    );
    const layout = layoutPoe2OpenStashBagGrids(2880, 1620);
    expect(detected.inventoryGrid?.originX).toBe(layout.inventory.originX);
    expect(detected.inventoryGrid?.originX).toBeGreaterThan((2 * 2880) / 3);
    expect(detected.stashGrid?.originX).toBeLessThan(2880 / 3);
    expect(detected.stashGrid?.rows).toBe(12);
    expect(detected.inventory?.occupied).toBe(60);
    expect(detected.inventory?.full).toBe(true);
  });
});
