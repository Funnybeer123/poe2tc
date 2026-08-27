import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopRuntime, REPO_ROOT, resolveRepoRoot } from "../../../apps/desktop/operatorHost.js";

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
    expect(live?.enabledModules).toEqual(expect.arrayContaining(["stash", "inventory"]));
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
});
