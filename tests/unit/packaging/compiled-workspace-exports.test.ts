import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CORE_DIST = path.join(ROOT, "packages/core/dist");
const OPERATOR_DIST = path.join(CORE_DIST, "operator");
const SQLITE_DIST = path.join(ROOT, "packages/persistence-sqlite/dist");

const OPERATOR_MODULES = [
  "disclaimer.js",
  "banner.js",
  "firstRun.js",
  "index.js",
  "settings.js",
  "priceFormat.js",
  "operatorRuntime.js",
  "dto.js",
  "ipcFailure.js",
  "replayCatalog.js",
];

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8")) as Record<string, unknown>;
}

function exportMap(pkg: Record<string, unknown>, subpath: string): Record<string, string> {
  const exportsField = pkg.exports as Record<string, Record<string, string>>;
  const mapped = exportsField[subpath];
  if (mapped === undefined) {
    throw new Error(`missing exports[${subpath}]`);
  }
  return mapped;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

describe("compiled workspace exports for Electron", () => {
  it("points runtime import/default at dist while keeping types and Vitest on source", () => {
    const core = readJson("packages/core/package.json");
    const sqlite = readJson("packages/persistence-sqlite/package.json");

    for (const mapped of [exportMap(core, "."), exportMap(core, "./operator"), exportMap(sqlite, ".")]) {
      expect(mapped.types).toMatch(/^\.\/src\//);
      expect(mapped.development).toMatch(/^\.\/src\//);
      expect(mapped.import).toMatch(/^\.\/dist\/.+\.js$/);
      expect(mapped.default).toMatch(/^\.\/dist\/.+\.js$/);
    }

    expect(exportMap(core, ".").import).toBe("./dist/index.js");
    expect(exportMap(core, "./operator").import).toBe("./dist/operator/index.js");
    expect(exportMap(sqlite, ".").import).toBe("./dist/index.js");
  });

  it("emits operator JS that Node (Electron ESM) can resolve without TypeScript", () => {
    execFileSync(npmCommand(), ["run", "build", "--workspace", "@poe2tc/core"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    execFileSync(npmCommand(), ["run", "build", "--workspace", "@poe2tc/persistence-sqlite"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });

    expect(existsSync(path.join(CORE_DIST, "index.js"))).toBe(true);
    expect(existsSync(path.join(SQLITE_DIST, "index.js"))).toBe(true);
    for (const file of OPERATOR_MODULES) {
      expect(existsSync(path.join(OPERATOR_DIST, file)), file).toBe(true);
    }

    const operatorJs = readdirSync(OPERATOR_DIST).filter((name) => name.endsWith(".js"));
    expect(operatorJs).toEqual(expect.arrayContaining(OPERATOR_MODULES));

    const probe = `
      const coreUrl = import.meta.resolve("@poe2tc/core");
      const operatorUrl = import.meta.resolve("@poe2tc/core/operator");
      const sqliteUrl = import.meta.resolve("@poe2tc/persistence-sqlite");
      const fail = (label, url, needle) => {
        if (!url.includes(needle)) {
          throw new Error(label + " resolved to " + url + ", expected " + needle);
        }
      };
      fail("core", coreUrl, "packages/core/dist/index.js");
      fail("operator", operatorUrl, "packages/core/dist/operator/index.js");
      fail("sqlite", sqliteUrl, "packages/persistence-sqlite/dist/index.js");
      const core = await import("@poe2tc/core");
      const operator = await import("@poe2tc/core/operator");
      if (typeof core.GGG_DISCLAIMER !== "string" || !core.GGG_DISCLAIMER.includes("Grinding Gear Games")) {
        throw new Error("core disclaimer missing");
      }
      if (operator.GGG_DISCLAIMER !== core.GGG_DISCLAIMER) {
        throw new Error("operator disclaimer mismatch");
      }
      const sqlite = await import("@poe2tc/persistence-sqlite");
      if (typeof sqlite.openSqliteDatabase !== "function") {
        throw new Error("sqlite openSqliteDatabase missing");
      }
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toBe("");
  });

  it("start scripts build compiled workspaces before Electron", () => {
    const rootPkg = readJson("package.json");
    const desktopPkg = readJson("apps/desktop/package.json");
    const scripts = rootPkg.scripts as Record<string, string>;
    expect(scripts["build:runtime"]).toBe("node scripts/build-runtime.mjs");
    expect(scripts.start).toBe("node scripts/start-desktop.mjs");
    expect(desktopPkg.scripts).toMatchObject({ start: "node ../../scripts/start-desktop.mjs" });

    const buildRuntime = readFileSync(path.join(ROOT, "scripts/build-runtime.mjs"), "utf8");
    expect(buildRuntime).toContain("@poe2tc/core");
    expect(buildRuntime).toContain("@poe2tc/persistence-sqlite");
    expect(buildRuntime).toContain("@poe2tc/overlay");
    expect(buildRuntime).toContain("@poe2tc/desktop");

    const startDesktop = readFileSync(path.join(ROOT, "scripts/start-desktop.mjs"), "utf8");
    expect(startDesktop).toContain("buildRuntime");
    expect(startDesktop).toContain("electron");
    expect(startDesktop).not.toContain("tsx");
  });

  it("can load compiled core from the emitted index without a TS loader", async () => {
    execFileSync(npmCommand(), ["run", "build", "--workspace", "@poe2tc/core"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    const disclaimerPath = path.join(OPERATOR_DIST, "disclaimer.js");
    const disclaimer = await import(pathToFileURL(disclaimerPath).href);
    expect(disclaimer.GGG_DISCLAIMER).toContain("Grinding Gear Games");
  });
});
