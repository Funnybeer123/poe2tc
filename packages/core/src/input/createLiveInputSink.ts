import type { QaArmingState, RuntimeCapabilities } from "../capabilities/createCapabilities.js";
import { createRedactingLogger } from "../logging/redactingLogger.js";
import { ForbiddenInputSink } from "./sinks/forbiddenInputSink.js";
import { NoopInputSink } from "./sinks/noopInputSink.js";
import type { InputSink } from "./types.js";

const nativeSinkLogger = createRedactingLogger({ redactIdentifiers: true });

export type LiveNativeSinkFactory = () => InputSink;

export interface CreateLiveInputSinkOptions {
  capabilities: RuntimeCapabilities;
  arming: Pick<QaArmingState, "armed"> & Partial<Pick<QaArmingState, "dryRunDefault">>;
  createNativeSink?: LiveNativeSinkFactory;
  onNativeError?: (error: Error) => void;
}

/**
 * Live-path sink selection. Replay keeps using NoopInputSink directly.
 * Public companion is always Forbidden. Native is constructed only when the
 * runtime can emit input, the session is armed, and dry-run is off.
 * Dry-run calibration must never bind SendInput.
 */
export function createLiveInputSink(options: CreateLiveInputSinkOptions): InputSink {
  if (!options.capabilities.canEmitNativeInput || options.capabilities.mode !== "authorized-qa") {
    return new ForbiddenInputSink();
  }
  if (!options.arming.armed || options.arming.dryRunDefault === true) {
    return new NoopInputSink();
  }
  if (options.createNativeSink === undefined) {
    const err = new Error("native-sink-unbound");
    nativeSinkLogger.error("native-sink-unavailable", { message: err.message });
    options.onNativeError?.(err);
    return new NoopInputSink();
  }
  try {
    return options.createNativeSink();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    nativeSinkLogger.error("native-sink-unavailable", { message: err.message });
    options.onNativeError?.(err);
    return new NoopInputSink();
  }
}
