import { createDesktopRuntime, tryAutoArmQa } from "../../../apps/desktop/operatorHost.js";
import { bindDesktopLiveSession } from "../../../apps/desktop/liveLoopHost.js";
import { describe, expect, it, vi } from "vitest";
import { createNoopLiveScheduler, createFullBagOpenStashPixels } from "../../helpers/liveGridFrame.js";

describe("desktop live loop host", () => {
  it("binds a fake capturer so arming can construct a native sink", async () => {
    const createNativeSink = vi.fn(() => ({
      kind: "native" as const,
      execute: vi.fn(async () => {
        const now = Date.now();
        return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now };
      }),
      cancel() {
        return;
      },
    }));
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
        POE2TC_DRY_RUN: "0",
      },
    });
    bindDesktopLiveSession(runtime, {
      capturer: {
        async getSources() {
          return [
            {
              id: "window:poe",
              name: "Path of Exile 2",
              thumbnail: {
                getSize: () => ({ width: 1920, height: 1080 }),
                toBitmap: () => createFullBagOpenStashPixels(),
              },
            },
          ];
        },
      },
      queryProcess: () => ({ name: "PathOfExile.exe", title: "Path of Exile 2" }),
      createNativeSink,
    });

    expect(createNativeSink).not.toHaveBeenCalled();
    expect(runtime.armQa().ok).toBe(true);
    expect(createNativeSink).toHaveBeenCalledTimes(1);
    expect(runtime.getLiveLoopStatus().sinkKind).toBe("native");
    const outcome = await runtime.tickLive();
    expect(outcome.result).toBe("ticked");
  });

  it("auto-arm starts the live loop after bind without a dashboard click", () => {
    const createNativeSink = vi.fn(() => ({
      kind: "native" as const,
      execute: vi.fn(async () => {
        const now = Date.now();
        return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now };
      }),
      cancel() {
        return;
      },
    }));
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
        POE2TC_DRY_RUN: "0",
      },
    });
    bindDesktopLiveSession(runtime, {
      capturer: {
        async getSources() {
          return [
            {
              id: "window:poe",
              name: "Path of Exile 2",
              thumbnail: {
                getSize: () => ({ width: 1920, height: 1080 }),
                toBitmap: () => createFullBagOpenStashPixels(),
              },
            },
          ];
        },
      },
      queryProcess: () => ({ name: "PathOfExile.exe", title: "Path of Exile 2" }),
      createNativeSink,
    });
    expect(runtime.getLiveLoopStatus().running).toBe(false);
    expect(tryAutoArmQa(runtime, { POE2TC_QA_ARMED: "1" }).armed).toBe(true);
    expect(runtime.getLiveLoopStatus().running).toBe(true);
    expect(createNativeSink).toHaveBeenCalledTimes(1);
  });

  it("resolves PathOfExileSteam.exe when the overlay is the queried foreground", async () => {
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
        POE2TC_DRY_RUN: "0",
      },
    });
    bindDesktopLiveSession(runtime, {
      capturer: {
        async getSources() {
          return [
            {
              id: "window:poe",
              name: "Path of Exile 2",
              thumbnail: {
                getSize: () => ({ width: 1920, height: 1080 }),
                toBitmap: () => createFullBagOpenStashPixels(),
              },
            },
          ];
        },
      },
      queryProcess: () => ({ pid: 2, name: "electron.exe", title: "PoE2 QA Trade Companion" }),
      findAllowlistedProcess: () => ({
        pid: 88,
        name: "PathOfExileSteam.exe",
        title: "Path of Exile 2",
      }),
      isProcessRunning: (pid) => pid === 88,
      createNativeSink: () => ({
        kind: "native" as const,
        execute: vi.fn(async () => {
          const now = Date.now();
          return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now };
        }),
        cancel() {
          return;
        },
      }),
    });
    expect(runtime.armQa().ok).toBe(true);
    const outcome = await runtime.tickLive();
    expect(outcome.result).toBe("ticked");
    if (outcome.result !== "ticked") {
      return;
    }
    expect(outcome.world.process.value.name).toBe("PathOfExileSteam.exe");
    expect(outcome.world.process.value.allowlisted).toBe(true);
    expect(outcome.verdict.code).not.toBe("window-not-allowlisted");
  });

  it("does not bind native construction on public companion", () => {
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      env: { POE2TC_DRY_RUN: "0" },
    });
    expect(runtime.getCapabilities().mode).toBe("public-companion");
    expect(runtime.startLiveLoop().reasons).toContain("public-mode");
  });
});
