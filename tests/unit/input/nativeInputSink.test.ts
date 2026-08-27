import { NativeInputSink, NativeUnavailableError, loadKoffiModule } from "@poe2tc/native-input";
import { describe, expect, it } from "vitest";

describe("NativeInputSink unavailable path", () => {
  it("throws native-unavailable when koffi cannot load", () => {
    expect(() =>
      loadKoffiModule(() => {
        throw new Error("simulated missing koffi");
      }),
    ).toThrow(/native-unavailable/);
  });

  it("throws native-unavailable when constructed on a non-Windows host", () => {
    const unusedLoader = (): never => {
      throw new Error("koffi must not load off win32");
    };
    expect(
      () =>
        new NativeInputSink({
          platform: "linux",
          loadKoffi: unusedLoader,
        }),
    ).toThrow(/native-unavailable/);
    try {
      new NativeInputSink({
        platform: "darwin",
        loadKoffi: unusedLoader,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(NativeUnavailableError);
      expect(String(err)).toMatch(/native-unavailable/);
      expect(String(err)).toMatch(/darwin/);
    }
    if (process.platform !== "win32") {
      expect(() => new NativeInputSink()).toThrow(/native-unavailable/);
    }
  });

  it("throws native-unavailable when an injected koffi loader fails on win32", () => {
    expect(
      () =>
        new NativeInputSink({
          platform: "win32",
          loadKoffi: () => {
            throw new Error("cannot find koffi");
          },
        }),
    ).toThrow(/native-unavailable/);
  });
});
