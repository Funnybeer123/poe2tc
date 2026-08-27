import { existsSync } from "node:fs";
import path from "node:path";

const ROOT_MARKERS = ["migrations", "fixtures"] as const;

/**
 * Walk upward from a compiled or source desktop file until the repo/pack root.
 * `apps/desktop/dist/*.js` is one level deeper than `apps/desktop/*.ts`.
 */
export function resolveRepoRoot(fromDir: string): string {
  let current = path.resolve(fromDir);
  for (;;) {
    if (ROOT_MARKERS.every((marker) => existsSync(path.join(current, marker)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`repo-root-not-found from ${fromDir}`);
    }
    current = parent;
  }
}
