import {
  FrozenClock,
  createCapabilities,
  createLiveAutomationLoop,
  createReplayArming,
  loadAutomationScenarioFile,
} from "@poe2tc/core";
import { LivePerceptionAdapter } from "@poe2tc/perception-live";
import { describe, expect, it, vi } from "vitest";
import { scenarioFixturePath } from "../../helpers/fixturePaths.js";
import { RepeatingFrameSource } from "../../helpers/liveGridFrame.js";

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
});
