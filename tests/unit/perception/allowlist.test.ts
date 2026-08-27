import {
  createEmptyWorldState,
  createReplayArming,
  createStateEstimator,
  FrozenClock,
  isProcessAllowlistedByArming,
  resolveObservedProcess,
  retainAllowlistedProcess,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";

const matching = { name: "PathOfExile.exe", title: "Path of Exile 2" };

describe("process allowlist", () => {
  const arming = createReplayArming();

  it("returns true for a matching process name and window title", () => {
    expect(isProcessAllowlistedByArming(matching, arming)).toBe(true);
  });

  it("returns false for a process name outside the allowlist", () => {
    expect(
      isProcessAllowlistedByArming({ name: "notepad.exe", title: "Path of Exile 2" }, arming),
    ).toBe(false);
  });

  it("returns false for a window title that does not include the allowlist fragment", () => {
    expect(
      isProcessAllowlistedByArming({ name: "PathOfExile.exe", title: "Not The Game" }, arming),
    ).toBe(false);
  });

  it("returns false when allowlists are empty (fail closed)", () => {
    expect(
      isProcessAllowlistedByArming(
        matching,
        createReplayArming({ allowlistedProcessNames: [], allowlistedWindowTitleIncludes: [] }),
      ),
    ).toBe(false);
  });

  it("recomputes allowlisted on the estimator from arming, ignoring derived true", () => {
    const clock = new FrozenClock(10_000);
    const estimator = createStateEstimator({ clock, arming });
    const world = estimator.estimate(createEmptyWorldState({ clock }), {
      tickId: 1,
      capturedAtMs: 10_000,
      evidenceId: "t",
      process: {
        value: { name: "chrome.exe", title: "Chrome", allowlisted: true },
        confidence: 1,
        observedAtMs: 10_000,
        freshness: "fresh",
      },
    });
    expect(world.process.value.allowlisted).toBe(false);
  });

  it("sets allowlisted true when the observed name and title match arming", () => {
    const clock = new FrozenClock(10_000);
    const estimator = createStateEstimator({ clock, arming });
    const world = estimator.estimate(createEmptyWorldState({ clock }), {
      tickId: 1,
      capturedAtMs: 10_000,
      evidenceId: "t",
      process: {
        value: { ...matching, allowlisted: false },
        confidence: 1,
        observedAtMs: 10_000,
        freshness: "fresh",
      },
    });
    expect(world.process.value.allowlisted).toBe(true);
  });

  it("keeps PathOfExileSteam.exe allowlisted when overlay is focused and the process is running", () => {
    const clock = new FrozenClock(10_000);
    const estimator = createStateEstimator({
      clock,
      arming,
      isProcessRunning: (pid) => pid === 77,
    });
    const poe = estimator.estimate(createEmptyWorldState({ clock }), {
      tickId: 1,
      capturedAtMs: 10_000,
      evidenceId: "poe",
      process: {
        value: { pid: 77, name: "PathOfExileSteam.exe", title: "Path of Exile 2", allowlisted: false },
        confidence: 1,
        observedAtMs: 10_000,
        freshness: "fresh",
      },
    });
    expect(poe.process.value.allowlisted).toBe(true);

    clock.advance(5_000);
    const overlay = estimator.estimate(poe, {
      tickId: 2,
      capturedAtMs: 15_000,
      evidenceId: "overlay",
      process: {
        value: { pid: 1, name: "electron.exe", title: "PoE2 QA Trade Companion", allowlisted: false },
        confidence: 1,
        observedAtMs: 15_000,
        freshness: "fresh",
      },
    });
    expect(overlay.process.value.allowlisted).toBe(true);
    expect(overlay.process.value.name).toBe("PathOfExileSteam.exe");
    const overlayIncoming = {
      value: { pid: 1, name: "electron.exe", title: "PoE2 QA Trade Companion", allowlisted: false },
      confidence: 1,
      observedAtMs: 15_000,
      freshness: "fresh" as const,
    };
    expect(retainAllowlistedProcess(poe.process, overlayIncoming, arming, () => false).value.allowlisted).toBe(
      true,
    );
    expect(
      retainAllowlistedProcess(
        { ...poe.process, freshness: "stale" },
        overlayIncoming,
        arming,
        () => false,
      ).value.allowlisted,
    ).toBe(false);
    expect(
      retainAllowlistedProcess(
        { ...poe.process, freshness: "stale" },
        overlayIncoming,
        arming,
        (pid) => pid === 77,
      ).value.allowlisted,
    ).toBe(true);
  });

  it("prefers a still-running Path of Exile window over overlay foreground", () => {
    const overlay = { pid: 2, name: "electron.exe", title: "PoE2 QA Trade Companion" };
    const poe = { pid: 88, name: "PathOfExileSteam.exe", title: "Path of Exile 2" };
    expect(
      resolveObservedProcess(overlay, arming, () => poe),
    ).toEqual(poe);
    expect(resolveObservedProcess(overlay, arming, () => undefined)).toEqual(overlay);
    expect(isProcessAllowlistedByArming(resolveObservedProcess(overlay, arming, () => poe), arming)).toBe(
      true,
    );
  });
});
