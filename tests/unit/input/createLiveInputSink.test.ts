import { createCapabilities, createLiveInputSink, ForbiddenInputSink, NoopInputSink } from "@poe2tc/core";
import { describe, expect, it, vi } from "vitest";

function nativeFactory() {
  return {
    kind: "native" as const,
    execute: vi.fn(async () => {
      const now = Date.now();
      return { accepted: true, executed: true, dryRun: false, startedAtMs: now, finishedAtMs: now };
    }),
    cancel() {
      return;
    },
  };
}

describe("createLiveInputSink", () => {
  it("returns ForbiddenInputSink and never constructs native in public companion", () => {
    const createNativeSink = vi.fn(nativeFactory);
    const sink = createLiveInputSink({
      capabilities: createCapabilities("public-companion"),
      arming: { armed: true },
      createNativeSink,
    });
    expect(sink).toBeInstanceOf(ForbiddenInputSink);
    expect(createNativeSink).not.toHaveBeenCalled();
  });

  it("returns NoopInputSink when authorized-qa is not armed", () => {
    const createNativeSink = vi.fn(nativeFactory);
    const sink = createLiveInputSink({
      capabilities: createCapabilities("authorized-qa"),
      arming: { armed: false },
      createNativeSink,
    });
    expect(sink).toBeInstanceOf(NoopInputSink);
    expect(createNativeSink).not.toHaveBeenCalled();
  });

  it("constructs the native sink only when authorized-qa is armed", () => {
    const sink = nativeFactory();
    const createNativeSink = vi.fn(() => sink);
    const result = createLiveInputSink({
      capabilities: createCapabilities("authorized-qa"),
      arming: { armed: true },
      createNativeSink,
    });
    expect(createNativeSink).toHaveBeenCalledTimes(1);
    expect(result).toBe(sink);
    expect(result.kind).toBe("native");
  });

  it("logs native constructor failure and returns Noop instead of throwing", () => {
    const onNativeError = vi.fn();
    const sink = createLiveInputSink({
      capabilities: createCapabilities("authorized-qa"),
      arming: { armed: true },
      createNativeSink: () => {
        throw new Error("user32 SendInput bind failed");
      },
      onNativeError,
    });
    expect(sink).toBeInstanceOf(NoopInputSink);
    expect(onNativeError).toHaveBeenCalledTimes(1);
    expect(onNativeError.mock.calls[0]?.[0]?.message).toMatch(/user32 SendInput bind failed/);
  });
});
