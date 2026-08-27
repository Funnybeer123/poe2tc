import {
  FrozenClock,
  createCapabilities,
  createLiveAutomationLoop,
  createReplayArming,
  loadAutomationScenarioFile,
} from "@poe2tc/core";
import { LivePerceptionAdapter } from "@poe2tc/perception-live";
import { describe, expect, it, vi } from "vitest";
import { scenarioFixturePath } from "../helpers/fixturePaths.js";
import { RepeatingFrameSource } from "../helpers/liveGridFrame.js";

describe("live stash-sort tick", () => {
  it("keeps observe-then-confirm: second tick does not immediately send another drag", async () => {
    const clock = new FrozenClock(20_000);
    const execute = vi.fn(async (action: { type: string }) => {
      const now = Date.now();
      return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now, action };
    });
    const loop = createLiveAutomationLoop({
      frameSource: new RepeatingFrameSource(20_000),
      perception: new LivePerceptionAdapter(() => ({
        name: "PathOfExile.exe",
        title: "Path of Exile 2",
      })),
      capabilities: createCapabilities("authorized-qa"),
      arming: createReplayArming({ dryRunDefault: false }),
      scenario: loadAutomationScenarioFile(scenarioFixturePath("stash-sort-live")),
      clock,
      createNativeSink: () => ({
        kind: "native",
        execute,
        cancel() {
          return;
        },
      }),
    });

    const first = await loop.tick();
    expect(first.result).toBe("ticked");
    if (first.result !== "ticked") {
      return;
    }
    expect(first.decision.intendedActions[0]?.type).toBe("mouse-drag");
    expect(first.world.flags.pendingStashTransfer?.kind).toBe("move");
    expect(execute.mock.calls.filter(([action]) => action.type === "mouse-drag")).toHaveLength(1);

    const second = await loop.tick();
    expect(second.result).toBe("ticked");
    if (second.result !== "ticked") {
      return;
    }
    expect(second.decision.reason).toContain("stash-backoff");
    expect(second.decision.intendedActions[0]?.type).toBe("noop");
    expect(second.world.flags.pendingStashTransfer?.kind).toBe("move");
    expect(execute.mock.calls.filter(([action]) => action.type === "mouse-drag")).toHaveLength(1);
  });
});
