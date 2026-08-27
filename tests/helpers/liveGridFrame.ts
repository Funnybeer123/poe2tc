import {
  DEFAULT_EMPTY_CELL_COLOR,
  layoutPoe2OpenStashBagGrids,
  type FrameSource,
  type GridGeometry,
  type PerceptionFrameInput,
} from "@poe2tc/core";
import { createRgba, fillRect } from "./encodePng.js";

export const LIVE_FRAME_WIDTH = 1920;
export const LIVE_FRAME_HEIGHT = 1080;
const OCCUPIED = [200, 160, 50, 255] as const;
const EMPTY = [...DEFAULT_EMPTY_CELL_COLOR, 255] as const;

function bagGridForFrame(width: number, height: number): GridGeometry {
  return layoutPoe2OpenStashBagGrids(width, height).inventory;
}

export function createEmptyBagOpenStashPixels(
  width = LIVE_FRAME_WIDTH,
  height = LIVE_FRAME_HEIGHT,
): Uint8Array {
  return createRgba(width, height, EMPTY);
}

export function createPartialBagOpenStashPixels(
  occupied: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  width = LIVE_FRAME_WIDTH,
  height = LIVE_FRAME_HEIGHT,
): Uint8Array {
  const pixels = createEmptyBagOpenStashPixels(width, height);
  const bag = bagGridForFrame(width, height);
  for (const [column, row] of occupied) {
    fillRect(
      pixels,
      width,
      bag.originX + column * bag.cellWidth,
      bag.originY + row * bag.cellHeight,
      bag.cellWidth,
      bag.cellHeight,
      OCCUPIED,
    );
  }
  return pixels;
}

export function createPackedMultiCellBagPixels(scale = 1): Uint8Array {
  const width = Math.round(LIVE_FRAME_WIDTH * scale);
  const height = Math.round(LIVE_FRAME_HEIGHT * scale);
  const blueChrome = [32, 40, 72, 255] as const;
  const pixels = createRgba(width, height, blueChrome);
  const bag = bagGridForFrame(width, height);
  const item = [210, 170, 60, 255] as const;
  const boots = [180, 80, 40, 255] as const;
  for (let column = 0; column < bag.columns; column += 2) {
    fillRect(
      pixels,
      width,
      bag.originX + column * bag.cellWidth,
      bag.originY,
      bag.cellWidth * 2,
      bag.cellHeight * 4,
      item,
    );
    fillRect(
      pixels,
      width,
      bag.originX + column * bag.cellWidth,
      bag.originY + bag.cellHeight * 4,
      bag.cellWidth * 2,
      bag.cellHeight,
      boots,
    );
  }
  return pixels;
}

export function createFullBagOpenStashPixels(
  width = LIVE_FRAME_WIDTH,
  height = LIVE_FRAME_HEIGHT,
): Uint8Array {
  const bag = bagGridForFrame(width, height);
  const occupied: Array<readonly [number, number]> = [];
  for (let y = 0; y < bag.rows; y += 1) {
    for (let x = 0; x < bag.columns; x += 1) {
      occupied.push([x, y]);
    }
  }
  return createPartialBagOpenStashPixels(occupied, width, height);
}

export function createLiveGridFrame(
  tickId: number,
  capturedAtMs: number,
  pixels: Uint8Array = createFullBagOpenStashPixels(),
): PerceptionFrameInput {
  const layout = layoutPoe2OpenStashBagGrids(LIVE_FRAME_WIDTH, LIVE_FRAME_HEIGHT);
  return {
    tickId,
    capturedAtMs,
    width: LIVE_FRAME_WIDTH,
    height: LIVE_FRAME_HEIGHT,
    pixels,
    derived: {
      inventoryGrid: layout.inventory,
      stashGrid: { ...layout.stash, tabId: "dump" },
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
