import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDesktopRuntime,
  REPO_ROOT,
  resolveRepoRoot,
  tryAutoArmQa,
} from "../../../apps/desktop/operatorHost.js";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "poe2tc-repo-"));
  scratch.push(root);
  mkdirSync(path.join(root, "migrations"));
  mkdirSync(path.join(root, "fixtures"));
  mkdirSync(path.join(root, "apps/desktop/dist"), { recursive: true });
  return root;
}

describe("desktop repo root from compiled dist", () => {
  it("walks up from apps/desktop/dist and apps/desktop to the folder with migrations and fixtures", () => {
    const root = fakeRepo();
    expect(resolveRepoRoot(path.join(root, "apps/desktop/dist"))).toBe(path.resolve(root));
    expect(resolveRepoRoot(path.join(root, "apps/desktop"))).toBe(path.resolve(root));
  });

  it("resolves this checkout from the compiled desktop output directory", () => {
    const fromDist = path.join(process.cwd(), "apps/desktop/dist");
    const resolved = resolveRepoRoot(fromDist);
    expect(resolved).toBe(path.resolve(process.cwd()));
    expect(existsSync(path.join(resolved, "migrations"))).toBe(true);
    expect(existsSync(path.join(resolved, "fixtures/market"))).toBe(true);
    expect(existsSync(path.join(resolved, "fixtures/replay"))).toBe(true);
    expect(existsSync(path.join(resolved, "fixtures/scenarios"))).toBe(true);
  });

  it("throws when no ancestor has migrations and fixtures", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "poe2tc-empty-"));
    scratch.push(empty);
    expect(() => resolveRepoRoot(empty)).toThrow(/repo-root-not-found/);
  });

  it("uses a REPO_ROOT that can apply migrations at runtime", () => {
    expect(REPO_ROOT).toBe(path.resolve(process.cwd()));
    expect(existsSync(path.join(REPO_ROOT, "migrations/001_init.sql"))).toBe(true);
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
    });
    expect(runtime.getCapabilities().mode).toBe("public-companion");
  });
});

describe("desktop QA dry-run env and live stash scenario", () => {
  it("sets dryRunDefault false from POE2TC_DRY_RUN=0 and seeds stash-sort-live without auto-arming", () => {
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
        POE2TC_DRY_RUN: "0",
      },
    });
    expect(runtime.getCapabilities().mode).toBe("authorized-qa");
    expect(runtime.getCapabilities().canEmitNativeInput).toBe(true);
    expect(runtime.getArming().acknowledged).toBe(true);
    expect(runtime.getArming().dryRunDefault).toBe(false);
    expect(runtime.getArming().armed).toBe(false);
    const live = runtime.getScenarios().find((scenario) => scenario.id === "stash-sort-live");
    expect(live?.executionMode).toBe("live");
    expect(live?.enabledModules).toEqual(expect.arrayContaining(["stash", "inventory", "recovery"]));
  });

  it("keeps dry-run default when POE2TC_DRY_RUN is unset", () => {
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
      },
    });
    expect(runtime.getArming().dryRunDefault).toBe(true);
    expect(runtime.getArming().armed).toBe(false);
  });

  it("auto-arms authorized-qa when POE2TC_QA_ARMED=1 and acknowledgement is already true", () => {
    const lines: string[] = [];
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
      },
    });
    expect(runtime.getArming().armed).toBe(false);
    const result = tryAutoArmQa(runtime, { POE2TC_QA_ARMED: "1" }, {
      info: (message) => {
        lines.push(message);
      },
    });
    expect(result.attempted).toBe(true);
    expect(result.armed).toBe(true);
    expect(runtime.getArming().armed).toBe(true);
    expect(lines).toContain("auto-arm ok");
  });

  it("auto-arms from persisted settings acknowledgement without POE2TC_QA_ACKNOWLEDGED", () => {
    const root = fakeRepo();
    const dbPath = path.join(root, "poe2tc.sqlite");
    const seeded = createDesktopRuntime({
      dbPath,
      clipboard: { readText: () => "" },
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
      },
    });
    expect(seeded.getArming().acknowledged).toBe(false);
    seeded.saveSettings({ ...seeded.getSettings(), qaAcknowledged: true });

    const runtime = createDesktopRuntime({
      dbPath,
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
      },
    });
    expect(runtime.getArming().acknowledged).toBe(true);
    expect(runtime.getArming().armed).toBe(false);
    const result = tryAutoArmQa(runtime, { POE2TC_QA_ARMED: "1" }, {
      info: () => {
        return;
      },
    });
    expect(result.armed).toBe(true);
    expect(runtime.getArming().armed).toBe(true);
  });

  it("does not persist armed across a new process when POE2TC_QA_ARMED is unset", () => {
    const root = fakeRepo();
    const dbPath = path.join(root, "poe2tc.sqlite");
    const first = createDesktopRuntime({
      dbPath,
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
      },
    });
    expect(tryAutoArmQa(first, { POE2TC_QA_ARMED: "1" }).armed).toBe(true);

    const restarted = createDesktopRuntime({
      dbPath,
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
      },
    });
    expect(restarted.getArming().armed).toBe(false);
    expect(tryAutoArmQa(restarted, {}).attempted).toBe(false);
    expect(restarted.getArming().armed).toBe(false);
  });

  it("does not auto-arm public-companion even if POE2TC_QA_ARMED=1", () => {
    const lines: string[] = [];
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: { POE2TC_QA_ARMED: "1" },
    });
    const result = tryAutoArmQa(runtime, { POE2TC_QA_ARMED: "1" }, {
      info: (message) => {
        lines.push(message);
      },
    });
    expect(runtime.getCapabilities().mode).toBe("public-companion");
    expect(result.attempted).toBe(true);
    expect(result.armed).toBe(false);
    expect(result.reasons).toContain("public-mode");
    expect(runtime.getArming().armed).toBe(false);
    expect(lines.some((line) => line.includes("auto-arm refused: public-mode"))).toBe(true);
  });

  it("refuses auto-arm when emergency stop is latched", () => {
    const lines: string[] = [];
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
        POE2TC_QA_ACKNOWLEDGED: "1",
      },
    });
    runtime.tripStop();
    const result = tryAutoArmQa(
      runtime,
      { POE2TC_QA_ARMED: "1" },
      {
        info: (message) => {
          lines.push(message);
        },
      },
    );
    expect(result.armed).toBe(false);
    expect(result.reasons).toContain("emergency-stop");
    expect(runtime.getArming().armed).toBe(false);
    expect(lines.some((line) => line.includes("emergency-stop"))).toBe(true);
  });

  it("logs evaluateQaArming reasons when auto-arm is requested without acknowledgement", () => {
    const lines: string[] = [];
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      hotkeyRegistered: true,
      env: {
        POE2TC_MODE: "authorized-qa",
        POE2TC_RUNTIME_MODE: "authorized-qa",
      },
    });
    const result = tryAutoArmQa(runtime, { POE2TC_QA_ARMED: "1" }, {
      info: (message) => {
        lines.push(message);
      },
    });
    expect(result.armed).toBe(false);
    expect(result.reasons).toContain("qa-not-acknowledged");
    expect(lines.some((line) => line.includes("qa-not-acknowledged"))).toBe(true);
  });

  it("does not emit input or seed live stash in public companion even if POE2TC_DRY_RUN=0", () => {
    const runtime = createDesktopRuntime({
      dbPath: ":memory:",
      clipboard: { readText: () => "" },
      env: { POE2TC_DRY_RUN: "0" },
    });
    expect(runtime.getCapabilities().mode).toBe("public-companion");
    expect(runtime.getCapabilities().canEmitNativeInput).toBe(false);
    expect(runtime.getArming().dryRunDefault).toBe(true);
    expect(runtime.getArming().armed).toBe(false);
    expect(runtime.getScenarios()).toEqual([]);
  });
});

describe("desktop whenReady error handling", () => {
  it("logs ready failures instead of leaving an unhandled rejection", () => {
    const source = readFileSync(path.join(process.cwd(), "apps/desktop/electron-main.ts"), "utf8");
    expect(source).toMatch(/whenReady\(\)\.then\(bootDesktopWhenReady\)\.catch\(logDesktopReadyFailure\)/);
    expect(source).toMatch(/desktop-ready-failed/);
    expect(source).toMatch(/export function logDesktopReadyFailure/);
  });

  it("auto-arms after live bind and operator windows, not during createDesktopRuntime", () => {
    const source = readFileSync(path.join(process.cwd(), "apps/desktop/electron-main.ts"), "utf8");
    const start = source.indexOf("export async function bootDesktopWhenReady");
    const end = source.indexOf("void app.whenReady()");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const boot = source.slice(start, end);
    expect(boot).toMatch(/await attachAuthorizedQaLiveLoop\(runtime\);/);
    expect(boot).toMatch(/createOperatorWindows\(\);/);
    expect(boot).toMatch(/tryAutoArmQa\(runtime, process\.env, logger\);/);
    expect(boot.indexOf("attachAuthorizedQaLiveLoop(runtime)")).toBeLessThan(boot.indexOf("tryAutoArmQa"));
    expect(boot.indexOf("createOperatorWindows()")).toBeLessThan(boot.indexOf("tryAutoArmQa"));
  });
});
