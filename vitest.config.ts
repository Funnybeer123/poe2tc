import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@poe2tc/perception-live": path.join(root, "packages/perception-live/src/index.ts"),
      "@poe2tc/native-input": path.join(root, "packages/native-input/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "replay",
          include: ["tests/replay/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
