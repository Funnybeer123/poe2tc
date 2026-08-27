#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntime, runCommand } from "./build-runtime.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const desktopDir = path.join(root, "apps/desktop");
const electronBin = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron",
);

buildRuntime();
runCommand(electronBin, ["."], desktopDir);
