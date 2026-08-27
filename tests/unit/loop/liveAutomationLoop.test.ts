import {
  FrozenClock,
  createCapabilities,
  createLiveAutomationLoop,
  createReplayArming,
  loadAutomationScenarioFile,
  resolveObservedProcess,
} from "@poe2tc/core";
import { LivePerceptionAdapter } from "@poe2tc/perception-live";
import { describe, expect, it, vi } from "vitest";
import { scenarioFixturePath } from "../../helpers/fixturePaths.js";
import {
  RepeatingFrameSource,
  createEmptyBagOpenStashPixels,
  createLiveGridFrame,
  createPartialBagOpenStashPixels,
} from "../../helpers/liveGridFrame.js";

const PROCESS = { pid: 42, name: "PathOfExile.exe", title: "Path of Exile 2" };

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

describe("LiveAutomationLoop", () => {
  it("ticks the orchestrator from a fake live frame source and can emit stash-move", async () => {
    const clock = new FrozenClock(20_000);
    const sink = nativeSink();
    const createNativeSink = vi.fn(() => sink);
    const loop = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(20_000),
      perception: new LivePerceptionAdapter(() => PROCESS),
      capabilities: createCapabilities("authorized-qa"),
      arming: createReplayArming({ armed: true, dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock,
      createNativeSink,
    });

    expect(createNativeSink).toHaveBeenCalledTimes(1);
    expect(loop.sinkKind).toBe("native");
    expect(loop.scenario.enabledModules).toContain("recovery");

    const outcome = await loop.tick();
    expect(outcome.result).toBe("ticked");
    if (outcome.result !== "ticked") {
      return;
    }
    expect(outcome.world.inventory.value.full).toBe(true);
    expect(outcome.world.flags.stashSessionActive).toBe(true);
    expect(outcome.decision.reason).toContain("stash-move:");
    expect(outcome.decision.intendedActions.some((action) => action.type === "mouse-drag")).toBe(true);
    expect(sink.execute).toHaveBeenCalled();
    expect(outcome.trace.executed).toBe(true);
  });

  it("does not construct native input for public companion", async () => {
    const createNativeSink = vi.fn(nativeSink);
    const loop = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(20_000),
      perception: new LivePerceptionAdapter(() => PROCESS),
      capabilities: createCapabilities("public-companion"),
      arming: createReplayArming({ armed: true, dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock: new FrozenClock(20_000),
      createNativeSink,
    });
    expect(createNativeSink).not.toHaveBeenCalled();
    expect(loop.sinkKind).toBe("forbidden");
    const outcome = await loop.tick();
    expect(outcome.result).toBe("ticked");
    if (outcome.result !== "ticked") {
      return;
    }
    expect(outcome.trace.executed).toBe(false);
  });

  it("plans dump transfers for a partial bag and not for an empty bag", async () => {
    const partial = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(
        20_000,
        createLiveGridFrame(1, 20_000, createPartialBagOpenStashPixels()),
      ),
      perception: new LivePerceptionAdapter(() => PROCESS),
      capabilities: createCapabilities("authorized-qa"),
      arming: createReplayArming({ armed: true, dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock: new FrozenClock(20_000),
      createNativeSink: nativeSink,
    });
    const partialTick = await partial.tick();
    expect(partialTick.result).toBe("ticked");
    if (partialTick.result !== "ticked") {
      return;
    }
    expect(partialTick.world.inventory.value.full).toBe(false);
    expect(partialTick.world.inventory.value.occupied).toBe(3);
    expect(partialTick.world.flags.stashSessionActive).toBe(true);
    expect(partialTick.decision.reason).toContain("stash-move:");
    expect(partialTick.decision.reason).toContain("Dump:dump");
    expect(partialTick.decision.intendedActions.some((action) => action.type === "mouse-drag")).toBe(true);

    const empty = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(
        20_000,
        createLiveGridFrame(1, 20_000, createEmptyBagOpenStashPixels()),
      ),
      perception: new LivePerceptionAdapter(() => PROCESS),
      capabilities: createCapabilities("authorized-qa"),
      arming: createReplayArming({ armed: true, dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock: new FrozenClock(20_000),
      createNativeSink: nativeSink,
    });
    const emptyTick = await empty.tick();
    expect(emptyTick.result).toBe("ticked");
    if (emptyTick.result !== "ticked") {
      return;
    }
    expect(emptyTick.world.inventory.value.occupied).toBe(0);
    expect(emptyTick.world.inventory.value.full).toBe(false);
    expect(emptyTick.world.flags.stashSessionActive).toBe(false);
    expect(emptyTick.decision.reason).not.toContain("stash-move:");
  });

  it("keeps PoE allowlisted after overlay focus when the process is still running", async () => {
    let queries = 0;
    const loop = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(20_000),
      perception: new LivePerceptionAdapter(() => {
        queries += 1;
        return queries === 1
          ? { pid: 88, name: "PathOfExileSteam.exe", title: "Path of Exile 2" }
          : { pid: 2, name: "electron.exe", title: "PoE2 QA Trade Companion" };
      }),
      capabilities: createCapabilities("authorized-qa"),
      arming: createReplayArming({ armed: true, dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock: new FrozenClock(20_000),
      createNativeSink: nativeSink,
      isProcessRunning: (pid) => pid === 88,
    });
    const first = await loop.tick();
    expect(first.result).toBe("ticked");
    if (first.result !== "ticked") {
      return;
    }
    expect(first.world.process.value.allowlisted).toBe(true);
    const second = await loop.tick();
    expect(second.result).toBe("ticked");
    if (second.result !== "ticked") {
      return;
    }
    expect(second.world.process.value.name).toBe("PathOfExileSteam.exe");
    expect(second.world.process.value.allowlisted).toBe(true);
    expect(second.verdict.code).not.toBe("window-not-allowlisted");
  });

  it("allowlists PathOfExileSteam.exe on the first tick when the overlay is foreground", async () => {
    const arming = createReplayArming({ armed: true, dryRunDefault: false });
    const loop = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(20_000),
      perception: new LivePerceptionAdapter(() =>
        resolveObservedProcess(
          { pid: 2, name: "electron.exe", title: "PoE2 QA Trade Companion" },
          arming,
          () => ({ pid: 88, name: "PathOfExileSteam.exe", title: "Path of Exile 2" }),
        ),
      ),
      capabilities: createCapabilities("authorized-qa"),
      arming,
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock: new FrozenClock(20_000),
      createNativeSink: nativeSink,
      isProcessRunning: (pid) => pid === 88,
    });
    const outcome = await loop.tick();
    expect(outcome.result).toBe("ticked");
    if (outcome.result !== "ticked") {
      return;
    }
    expect(outcome.world.process.value.name).toBe("PathOfExileSteam.exe");
    expect(outcome.world.process.value.allowlisted).toBe(true);
    expect(outcome.verdict.code).not.toBe("window-not-allowlisted");
  });
});
