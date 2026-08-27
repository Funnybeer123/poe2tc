import { FrozenClock } from "@poe2tc/core";
import {
  ClipboardSource,
  createElectronClipboardReader,
  ElectronFrameSource,
  LivePerceptionAdapter,
  PerceptionUnavailableError,
  Win32ProcessQuery,
} from "@poe2tc/perception-live";
import { describe, expect, it } from "vitest";

describe("perception-live adapters", () => {
  it("throws perception-unavailable when constructing Win32ProcessQuery off Windows", () => {
    expect(
      () =>
        new Win32ProcessQuery({
          platform: "linux",
          loadKoffi: () => {
            throw new Error("should-not-load");
          },
        }),
    ).toThrow(PerceptionUnavailableError);
  });

  it("captures a frame from an injected desktopCapturer", async () => {
    const source = new ElectronFrameSource({
      clock: new FrozenClock(42_000),
      sourceNameIncludes: ["Path of Exile 2"],
      capturer: {
        async getSources() {
          return [
            {
              id: "window:1",
              name: "Path of Exile 2",
              thumbnail: {
                getSize: () => ({ width: 2, height: 2 }),
                toBitmap: () => {
                  const bgra = new Uint8Array(16);
                  bgra.set([10, 20, 30, 255], 0);
                  return bgra;
                },
              },
            },
          ];
        },
      },
    });
    const frame = await source.nextFrame();
    expect(frame).not.toBeNull();
    expect(frame?.tickId).toBe(1);
    expect(frame?.capturedAtMs).toBe(42_000);
    expect(frame?.width).toBe(2);
    expect(frame?.height).toBe(2);
    expect(frame?.pixels?.[0]).toBe(30);
    expect(frame?.pixels?.[1]).toBe(20);
    expect(frame?.pixels?.[2]).toBe(10);
  });

  it("reads clipboard text through the injected reader only", () => {
    const clipboard = createElectronClipboardReader({ readText: () => "Rarity: Unique" });
    const source = new ClipboardSource(clipboard);
    expect(source.readText()).toBe("Rarity: Unique");
  });

  it("maps analyze errors to unknown UI instead of throwing", async () => {
    const adapter = new LivePerceptionAdapter(() => {
      throw new Error("no-hwnd");
    });
    const frame = await adapter.analyze({
      tickId: 3,
      capturedAtMs: 1_000,
      width: 8,
      height: 8,
    });
    expect(frame.ui?.value.kind).toBe("unknown");
    expect(frame.ui?.confidence).toBe(0);
    expect(frame.process?.value.allowlisted).toBe(false);
  });

  it("populates inventory and stash grids from live pixels when the bag is full", async () => {
    const { DEFAULT_INVENTORY_GRID, DEFAULT_STASH_GRID } = await import("@poe2tc/core");
    const { createFullBagOpenStashPixels } = await import("../../helpers/liveGridFrame.js");
    const adapter = new LivePerceptionAdapter(() => ({
      name: "PathOfExile.exe",
      title: "Path of Exile 2",
    }));
    const frame = await adapter.analyze({
      tickId: 4,
      capturedAtMs: 8_000,
      width: 1920,
      height: 1080,
      pixels: createFullBagOpenStashPixels(),
      derived: {
        inventoryGrid: DEFAULT_INVENTORY_GRID,
        stashGrid: { ...DEFAULT_STASH_GRID, tabId: "dump" },
      },
    });
    expect(frame.inventory?.value.full).toBe(true);
    expect(frame.inventory?.value.cells.some((cell) => cell.itemFingerprint?.startsWith("live-occ:"))).toBe(
      true,
    );
    expect(frame.stash?.value.tabId).toBe("dump");
    expect(frame.stash?.value.cells.some((cell) => cell.occupied === false)).toBe(true);
    expect(frame.ui?.value.kind).toBe("stash");
    expect(frame.flags?.stashItemCatalog).toBeDefined();
  });

  it("stamps live-occ dump tokens for a partial bag and not for an empty bag", async () => {
    const { DEFAULT_INVENTORY_GRID, DEFAULT_STASH_GRID } = await import("@poe2tc/core");
    const { createEmptyBagOpenStashPixels, createPartialBagOpenStashPixels } = await import(
      "../../helpers/liveGridFrame.js"
    );
    const adapter = new LivePerceptionAdapter(() => ({
      name: "PathOfExile.exe",
      title: "Path of Exile 2",
    }));
    const derived = {
      inventoryGrid: DEFAULT_INVENTORY_GRID,
      stashGrid: { ...DEFAULT_STASH_GRID, tabId: "dump" },
    };
    const partial = await adapter.analyze({
      tickId: 5,
      capturedAtMs: 8_000,
      width: 1920,
      height: 1080,
      pixels: createPartialBagOpenStashPixels(),
      derived,
    });
    expect(partial.inventory?.value.full).toBe(false);
    expect(partial.inventory?.value.occupied).toBe(3);
    expect(partial.inventory?.value.cells.filter((cell) => cell.itemFingerprint?.startsWith("live-occ:"))).toHaveLength(
      3,
    );
    expect(Object.keys(partial.flags?.stashItemCatalog ?? {})).toHaveLength(3);

    const empty = await adapter.analyze({
      tickId: 6,
      capturedAtMs: 8_000,
      width: 1920,
      height: 1080,
      pixels: createEmptyBagOpenStashPixels(),
      derived,
    });
    expect(empty.inventory?.value.occupied).toBe(0);
    expect(empty.inventory?.value.cells.every((cell) => cell.itemFingerprint === undefined)).toBe(true);
    expect(empty.flags?.stashItemCatalog).toBeUndefined();
  });

  it("attaches queried process metadata on success", async () => {
    const adapter = new LivePerceptionAdapter(() => ({
      pid: 11,
      name: "PathOfExile.exe",
      title: "Path of Exile 2",
    }));
    const frame = await adapter.analyze({
      tickId: 1,
      capturedAtMs: 5_000,
      width: 64,
      height: 64,
    });
    expect(frame.process?.value.name).toBe("PathOfExile.exe");
    expect(frame.process?.value.title).toBe("Path of Exile 2");
    expect(frame.process?.value.allowlisted).toBe(false);
  });
});
