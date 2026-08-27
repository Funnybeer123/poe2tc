import {
  DEFAULT_EMPTY_CELL_COLOR,
  DEFAULT_INVENTORY_GRID,
  DEFAULT_STASH_GRID,
  type FrameSource,
  type PerceptionFrameInput,
} from "@poe2tc/core";
import { createRgba, fillRect } from "./encodePng.js";

export const LIVE_FRAME_WIDTH = 1920;
export const LIVE_FRAME_HEIGHT = 1080;
const OCCUPIED = [200, 160, 50, 255] as const;
const EMPTY = [...DEFAULT_EMPTY_CELL_COLOR, 255] as const;

export function createFullBagOpenStashPixels(): Uint8Array {
  const pixels = createRgba(LIVE_FRAME_WIDTH, LIVE_FRAME_HEIGHT, EMPTY);
  const bag = DEFAULT_INVENTORY_GRID;
  fillRect(
    pixels,
    LIVE_FRAME_WIDTH,
    bag.originX,
    bag.originY,
    bag.columns * bag.cellWidth,
    bag.rows * bag.cellHeight,
    OCCUPIED,
  );
  return pixels;
}

export function createLiveGridFrame(tickId: number, capturedAtMs: number): PerceptionFrameInput {
  return {
    tickId,
    capturedAtMs,
    width: LIVE_FRAME_WIDTH,
    height: LIVE_FRAME_HEIGHT,
    pixels: createFullBagOpenStashPixels(),
    derived: {
      inventoryGrid: DEFAULT_INVENTORY_GRID,
      stashGrid: { ...DEFAULT_STASH_GRID, tabId: "dump" },
    },
  };
}

export class RepeatingFrameSource implements FrameSource {
  #tickId = 0;

  constructor(
    private readonly capturedAtMs: number,
    private readonly frame: Omit<PerceptionFrameInput, "tickId" | "capturedAtMs"> = createLiveGridFrame(
      1,
      capturedAtMs,
    ),
  ) {}

  async nextFrame(): Promise<PerceptionFrameInput | null> {
    this.#tickId += 1;
    return {
      ...this.frame,
      tickId: this.#tickId,
      capturedAtMs: this.capturedAtMs,
    };
  }
}

export function createNoopLiveScheduler(): {
  start: (tick: () => void, intervalMs: number) => number;
  stop: (handle: unknown) => void;
  ticks: Array<() => void>;
} {
  const ticks: Array<() => void> = [];
  return {
    ticks,
    start(tick) {
      ticks.push(tick);
      return ticks.length;
    },
    stop() {
      return;
    },
  };
}
