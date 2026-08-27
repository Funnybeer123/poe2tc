import {
  FrozenClock,
  MemorySettingsStore,
  createFixtureReplayCatalog,
  createOperatorRuntime,
  EmergencyStop,
  loadAutomationScenarioFile,
} from "@poe2tc/core";
import { join } from "node:path";
import { LivePerceptionAdapter } from "@poe2tc/perception-live";
import { describe, expect, it, vi } from "vitest";
import { REPO_ROOT, scenarioFixturePath } from "../../helpers/fixturePaths.js";
import { createNoopLiveScheduler, RepeatingFrameSource } from "../../helpers/liveGridFrame.js";

function nativeSink() {
  return {
    kind: "native" as const,
    execute: vi.fn(async () => {
      const now = Date.now();
      return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now };
    }),
    cancel: vi.fn(),
  };
}

describe("OperatorRuntime live loop", () => {
  it("does not construct native input when public companion is bound and armed", () => {
    const createNativeSink = vi.fn(nativeSink);
    const runtime = createOperatorRuntime({
      mode: "public-companion",
      settingsStore: new MemorySettingsStore(),
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      initialArming: { acknowledged: true, dryRunDefault: false },
    });
    runtime.bindLiveSession({
      frameSource: new RepeatingFrameSource(50_000),
      createNativeSink,
    });
    expect(runtime.armQa().ok).toBe(false);
    expect(runtime.startLiveLoop().reasons).toContain("public-mode");
    expect(createNativeSink).not.toHaveBeenCalled();
    expect(runtime.getLiveLoopStatus().sinkKind).toBe("none");
  });

  it("constructs NativeInputSink only after authorized-qa arm", async () => {
    const sink = nativeSink();
    const createNativeSink = vi.fn(() => sink);
    const scheduler = createNoopLiveScheduler();
    const runtime = createOperatorRuntime({
      mode: "authorized-qa",
      clock: new FrozenClock(50_000),
      emergencyStop: new EmergencyStop(),
      settingsStore: new MemorySettingsStore(),
      hotkeyRegistered: true,
      liveScheduler: scheduler,
      initialArming: { acknowledged: true, dryRunDefault: false },
    });
    runtime.saveScenario(loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")));
    runtime.bindLiveSession({
      frameSource: new RepeatingFrameSource(50_000),
      perception: new LivePerceptionAdapter(() => ({
        name: "PathOfExile.exe",
        title: "Path of Exile 2",
      })),
      createNativeSink,
    });

    expect(createNativeSink).not.toHaveBeenCalled();
    expect(runtime.startLiveLoop().reasons).toContain("qa-not-armed");

    const armed = runtime.armQa();
    expect(armed.ok).toBe(true);
    expect(createNativeSink).toHaveBeenCalledTimes(1);
    expect(runtime.getLiveLoopStatus().running).toBe(true);
    expect(runtime.getLiveLoopStatus().sinkKind).toBe("native");
    expect(runtime.getLiveLoopStatus().scenarioId).toBe("stash-sort-live");

    const outcome = await runtime.tickLive();
    expect(outcome.result).toBe("ticked");
    if (outcome.result !== "ticked") {
      return;
    }
    expect(outcome.decision.reason).toContain("stash-move:");
    expect(sink.execute).toHaveBeenCalled();
  });

  it("latches emergency stop and blocks later live ticks", async () => {
    const sink = nativeSink();
    const runtime = createOperatorRuntime({
      mode: "authorized-qa",
      clock: new FrozenClock(50_000),
      emergencyStop: new EmergencyStop(),
      settingsStore: new MemorySettingsStore(),
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      initialArming: { acknowledged: true, dryRunDefault: false },
    });
    runtime.saveScenario(loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")));
    runtime.bindLiveSession({
      frameSource: new RepeatingFrameSource(50_000),
      perception: new LivePerceptionAdapter(() => ({
        name: "PathOfExile.exe",
        title: "Path of Exile 2",
      })),
      createNativeSink: () => sink,
    });
    expect(runtime.armQa().ok).toBe(true);
    await runtime.tickLive();
    const stopped = runtime.tripStop();
    expect(stopped.latched).toBe(true);
    expect(runtime.getLiveLoopStatus().running).toBe(false);
    expect(runtime.armQa().ok).toBe(false);
    expect(await runtime.tickLive()).toEqual({ result: "not-running" });
    expect(sink.cancel).toHaveBeenCalled();
  });

  it("keeps replay on NoopInputSink with executed false after live bindings exist", async () => {
    const createNativeSink = vi.fn(nativeSink);
    const runtime = createOperatorRuntime({
      mode: "authorized-qa",
      clock: new FrozenClock(50_000),
      settingsStore: new MemorySettingsStore(),
      hotkeyRegistered: true,
      liveScheduler: createNoopLiveScheduler(),
      initialArming: { acknowledged: true, dryRunDefault: false },
      replayCatalog: createFixtureReplayCatalog({
        fixturesDir: join(REPO_ROOT, "fixtures/replay"),
        scenariosDir: join(REPO_ROOT, "fixtures/scenarios"),
      }),
    });
    runtime.bindLiveSession({
      frameSource: new RepeatingFrameSource(50_000),
      createNativeSink,
    });
    const replay = await runtime.runReplay("full-loop");
    expect(replay.sinkKind).toBe("noop");
    expect(replay.traces.every((trace) => trace.executed === false)).toBe(true);
    expect(createNativeSink).not.toHaveBeenCalled();
    expect(runtime.getLiveLoopStatus().running).toBe(false);
  });
});
