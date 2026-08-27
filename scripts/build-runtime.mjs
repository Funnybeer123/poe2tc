#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Workspaces Electron loads at runtime. Overlay is Vite-bundled; desktop is tsc. */
export const RUNTIME_WORKSPACES = [
  "@poe2tc/core",
  "@poe2tc/persistence-sqlite",
  "@poe2tc/overlay",
  "@poe2tc/desktop",
];

export function runCommand(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${String(result.status)}`);
  }
}

export function buildRuntime() {
  for (const workspace of RUNTIME_WORKSPACES) {
    runCommand("npm", ["run", "build", "--workspace", workspace]);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  buildRuntime();
}
