import {
  isQaBuildEnabled,
  parseDryRunDefaultEnv,
  parseQaArmedEnv,
  resolveRuntimeMode,
  resolveRuntimeModeFromEnv,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";

describe("public-mode compile-time flag", () => {
  it("cannot resolve authorized-qa without a compile-time QA flag", () => {
    expect(
      resolveRuntimeMode({
        compileTimeMode: "public-companion",
        runtimeMode: "authorized-qa",
      }),
    ).toBe("public-companion");
    expect(isQaBuildEnabled("public-companion")).toBe(false);
  });

  it("ignores POE2TC_RUNTIME_MODE when compile-time mode is public", () => {
    expect(
      resolveRuntimeModeFromEnv({
        POE2TC_MODE: "public-companion",
        POE2TC_RUNTIME_MODE: "authorized-qa",
      }),
    ).toBe("public-companion");
  });

  it("parses POE2TC_DRY_RUN with dry-run remaining the default", () => {
    expect(parseDryRunDefaultEnv(undefined)).toBe(true);
    expect(parseDryRunDefaultEnv("1")).toBe(true);
    expect(parseDryRunDefaultEnv("true")).toBe(true);
    expect(parseDryRunDefaultEnv("TRUE")).toBe(true);
    expect(parseDryRunDefaultEnv("0")).toBe(false);
    expect(parseDryRunDefaultEnv("false")).toBe(false);
    expect(parseDryRunDefaultEnv("FALSE")).toBe(false);
    expect(parseDryRunDefaultEnv("maybe")).toBe(true);
  });

  it("parses POE2TC_QA_ARMED as off unless 1 or true", () => {
    expect(parseQaArmedEnv(undefined)).toBe(false);
    expect(parseQaArmedEnv("0")).toBe(false);
    expect(parseQaArmedEnv("false")).toBe(false);
    expect(parseQaArmedEnv("maybe")).toBe(false);
    expect(parseQaArmedEnv("1")).toBe(true);
    expect(parseQaArmedEnv("true")).toBe(true);
    expect(parseQaArmedEnv("TRUE")).toBe(true);
  });

  it("allows authorized-qa only when compile-time mode is authorized-qa", () => {
    expect(
      resolveRuntimeMode({
        compileTimeMode: "authorized-qa",
        runtimeMode: "authorized-qa",
      }),
    ).toBe("authorized-qa");
    expect(
      resolveRuntimeMode({
        compileTimeMode: "authorized-qa",
        runtimeMode: "public-companion",
      }),
    ).toBe("public-companion");
  });
});
