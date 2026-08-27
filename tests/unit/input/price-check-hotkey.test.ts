import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public companion price-check hotkey", () => {
  const source = readFileSync(path.join(process.cwd(), "apps/desktop/electron-main.ts"), "utf8");

  it("registers a user-invoked price-check that does not enqueue game input", () => {
    expect(source).toMatch(/PRICE_CHECK_ACCELERATOR/);
    expect(source).toMatch(/registerPriceCheckHotkey/);
    expect(source).toMatch(/parseClipboard/);
    expect(source).not.toMatch(/import\s+.*GameInputController/);
    expect(source).not.toMatch(/\.enqueue\(/);
    expect(source).not.toMatch(/@poe2tc\/native-input/);
    expect(source).not.toMatch(/NativeInputSink/);
  });

  it("still trips the emergency latch from the global hotkey", () => {
    expect(source).toMatch(/CommandOrControl\+Shift\+F12/);
    expect(source).toMatch(/emergencyStop/);
    expect(source).toMatch(/tripStop|emergencyStop\.trip/);
  });

  it("creates overlay, hidden worker, and always-on-top QA banner", () => {
    expect(source).toMatch(/createOverlayWindow/);
    expect(source).toMatch(/createHiddenWorker/);
    expect(source).toMatch(/show: false/);
    expect(source).toMatch(/createQaBannerWindow/);
    expect(source).toMatch(/alwaysOnTop: true/);
    expect(source).toMatch(/closable: false/);
  });

  it("creates a click-through dry-run calibration overlay only in authorized-qa", () => {
    expect(source).toMatch(/createCalibrationOverlayWindow/);
    expect(source).toMatch(/calibration\.html/);
    expect(source).toMatch(/setIgnoreMouseEvents\(true/);
    expect(source).toMatch(/transparent: true/);
    expect(source).toMatch(/const calibration = qa \? createCalibrationOverlayWindow\(\) : undefined/);
    expect(source).not.toMatch(/@poe2tc\/native-input/);
  });
});
