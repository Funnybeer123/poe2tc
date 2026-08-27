import {
  analyzeFailureFrame,
  createRedactingLogger,
  DEFAULT_INVENTORY_GRID,
  DEFAULT_STASH_GRID,
  detectGrids,
  type GridGeometry,
  type PerceptionAdapter,
  type PerceptionFrame,
  type PerceptionFrameInput,
} from "@poe2tc/core";
import { enrichLiveGrids, LIVE_DUMP_TAB_ID, LIVE_GRID_CONFIDENCE } from "./liveGridObserve.js";
import type { ForegroundProcessInfo } from "./win32Process.js";

export type ForegroundProcessQuery = () => ForegroundProcessInfo;

const liveGridLogger = createRedactingLogger({ redactIdentifiers: true });

export interface LivePerceptionAdapterOptions {
  queryProcess: ForegroundProcessQuery;
  inventoryGrid?: GridGeometry;
  stashGrid?: GridGeometry;
}

/**
 * Live perception: Win32 process metadata plus detectGrids on captured pixels.
 * Default bag/stash geometry is a placeholder until a PoE 2 client calibration
 * is available. Full-bag occupancy tokens are enough to plan a stash-move.
 */
export class LivePerceptionAdapter implements PerceptionAdapter {
  readonly #queryProcess: ForegroundProcessQuery;
  readonly #inventoryGrid: GridGeometry;
  readonly #stashGrid: GridGeometry;

  constructor(
    queryProcess: ForegroundProcessQuery | LivePerceptionAdapterOptions,
    grids?: Pick<LivePerceptionAdapterOptions, "inventoryGrid" | "stashGrid">,
  ) {
    if (typeof queryProcess === "function") {
      this.#queryProcess = queryProcess;
      this.#inventoryGrid = grids?.inventoryGrid ?? DEFAULT_INVENTORY_GRID;
      this.#stashGrid = {
        ...(grids?.stashGrid ?? DEFAULT_STASH_GRID),
        tabId: grids?.stashGrid?.tabId ?? LIVE_DUMP_TAB_ID,
      };
      return;
    }
    this.#queryProcess = queryProcess.queryProcess;
    this.#inventoryGrid = queryProcess.inventoryGrid ?? DEFAULT_INVENTORY_GRID;
    this.#stashGrid = {
      ...(queryProcess.stashGrid ?? DEFAULT_STASH_GRID),
      tabId: queryProcess.stashGrid?.tabId ?? LIVE_DUMP_TAB_ID,
    };
  }

  async analyze(frame: PerceptionFrameInput): Promise<PerceptionFrame> {
    try {
      const process = this.#queryProcess();
      const grids = detectGrids({
        ...frame,
        derived: {
          ...frame.derived,
          inventoryGrid: frame.derived?.inventoryGrid ?? this.#inventoryGrid,
          stashGrid: frame.derived?.stashGrid ?? this.#stashGrid,
        },
      });
      const enriched = enrichLiveGrids(grids);
      if (enriched.liveGrid !== undefined) {
        liveGridLogger.info("live-grid", enriched.liveGrid);
      }
      const uiKind =
        enriched.stash !== undefined && enriched.stash.cells.length > 0
          ? "stash"
          : enriched.inventory !== undefined && enriched.inventory.cells.length > 0
            ? "inventory"
            : "unknown";
      const at = frame.capturedAtMs;
      return {
        tickId: frame.tickId,
        capturedAtMs: frame.capturedAtMs,
        evidenceId: enriched.evidenceId ?? `live:${String(frame.tickId)}`,
        process: {
          value: {
            pid: process.pid,
            name: process.name,
            title: process.title,
            allowlisted: false,
          },
          confidence: process.name !== undefined || process.title !== undefined ? 0.9 : 0,
          observedAtMs: at,
          freshness: "fresh",
        },
        inventory:
          enriched.inventory === undefined
            ? undefined
            : {
                value: enriched.inventory,
                confidence: LIVE_GRID_CONFIDENCE,
                observedAtMs: at,
                freshness: "fresh",
                evidenceId: enriched.evidenceId,
              },
        stash:
          enriched.stash === undefined
            ? undefined
            : {
                value: enriched.stash,
                confidence: LIVE_GRID_CONFIDENCE,
                observedAtMs: at,
                freshness: "fresh",
                evidenceId: enriched.evidenceId,
              },
        ui: {
          value:
            uiKind === "unknown"
              ? { kind: "unknown", details: "live-ui-deferred" }
              : { kind: uiKind, details: `live-grids:${enriched.source}` },
          confidence: uiKind === "unknown" ? 0.2 : LIVE_GRID_CONFIDENCE,
          observedAtMs: at,
          freshness: "fresh",
        },
        flags: {
          ...(Object.keys(enriched.catalog).length > 0 ? { stashItemCatalog: enriched.catalog } : {}),
          ...(enriched.liveGrid !== undefined ? { liveInventoryGrid: enriched.liveGrid } : {}),
          ...(enriched.liveStashGrid !== undefined ? { liveStashGrid: enriched.liveStashGrid } : {}),
          liveFrameWidth: frame.width,
          liveFrameHeight: frame.height,
        },
      };
    } catch (error) {
      return analyzeFailureFrame(frame, error);
    }
  }
}

export function createLivePerceptionAdapter(
  queryProcess: ForegroundProcessQuery | LivePerceptionAdapterOptions,
): LivePerceptionAdapter {
  return typeof queryProcess === "function"
    ? new LivePerceptionAdapter(queryProcess)
    : new LivePerceptionAdapter(queryProcess);
}
