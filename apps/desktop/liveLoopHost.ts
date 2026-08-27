import { SystemClock, type InputSink, type OperatorRuntime } from "@poe2tc/core";
import {
  createElectronFrameSource,
  createLivePerceptionAdapter,
  PerceptionUnavailableError,
  Win32ProcessQuery,
  type DesktopCapturerLike,
  type ForegroundProcessInfo,
} from "@poe2tc/perception-live";
import { NativeInputSink } from "@poe2tc/native-input";

export interface DesktopLiveSessionOptions {
  capturer: DesktopCapturerLike;
  queryProcess?: () => ForegroundProcessInfo;
  createNativeSink?: () => InputSink;
}

function queryForegroundOrEmpty(): () => ForegroundProcessInfo {
  try {
    const query = new Win32ProcessQuery();
    return () => query.query();
  } catch (error) {
    if (error instanceof PerceptionUnavailableError) {
      return () => ({});
    }
    throw error;
  }
}

function createNativeSinkOrThrow(): InputSink {
  return new NativeInputSink();
}

/**
 * Binds live capture + NativeInputSink construction to OperatorRuntime.
 * Call only from authorized-qa. Public companion must never load this module.
 */
export function bindDesktopLiveSession(
  runtime: OperatorRuntime,
  options: DesktopLiveSessionOptions,
): void {
  const titles = runtime.getArming().allowlistedWindowTitleIncludes;
  runtime.bindLiveSession({
    frameSource: createElectronFrameSource({
      capturer: options.capturer,
      clock: new SystemClock(),
      sourceNameIncludes: titles.length > 0 ? titles : ["Path of Exile 2"],
      requireNameMatch: true,
    }),
    perception: createLivePerceptionAdapter(options.queryProcess ?? queryForegroundOrEmpty()),
    createNativeSink: options.createNativeSink ?? createNativeSinkOrThrow,
  });
}
