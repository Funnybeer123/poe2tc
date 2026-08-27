import {
  resolveObservedProcess,
  SystemClock,
  type AllowlistArming,
  type InputSink,
  type OperatorRuntime,
} from "@poe2tc/core";
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
  findAllowlistedProcess?: () => ForegroundProcessInfo | undefined;
  createNativeSink?: () => InputSink;
  isProcessRunning?: (pid: number) => boolean;
  deviceScaleFactor?: number;
}

function readDeviceScaleFactor(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const fromEnv = Number(process.env.POE2TC_DEVICE_SCALE);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return 1;
}

function bindProcessQuery(
  options: DesktopLiveSessionOptions,
  arming: AllowlistArming,
): {
  queryProcess: () => ForegroundProcessInfo;
  isProcessRunning?: (pid: number) => boolean;
} {
  const findAllowlisted =
    options.findAllowlistedProcess ??
    (() => undefined);

  if (options.queryProcess !== undefined) {
    return {
      queryProcess: () =>
        resolveObservedProcess(options.queryProcess!(), arming, findAllowlisted),
      isProcessRunning: options.isProcessRunning,
    };
  }
  try {
    const query = new Win32ProcessQuery();
    return {
      queryProcess: () =>
        resolveObservedProcess(query.query(), arming, () => {
          const injected = findAllowlisted();
          if (injected !== undefined) {
            return injected;
          }
          for (const title of arming.allowlistedWindowTitleIncludes) {
            const found = query.findWindowByTitle(title);
            if (found.pid !== undefined || found.name !== undefined || found.title !== undefined) {
              return found;
            }
          }
          return undefined;
        }),
      isProcessRunning: (pid) => query.isPidRunning(pid),
    };
  } catch (error) {
    if (error instanceof PerceptionUnavailableError) {
      return {
        queryProcess: () => resolveObservedProcess({}, arming, findAllowlisted),
      };
    }
    throw error;
  }
}

let cachedNativeSink: InputSink | undefined;

function createNativeSinkOrThrow(): InputSink {
  cachedNativeSink ??= new NativeInputSink();
  return cachedNativeSink;
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
  const scale = readDeviceScaleFactor(options.deviceScaleFactor);
  const process = bindProcessQuery(options, {
    allowlistedProcessNames: runtime.getArming().allowlistedProcessNames,
    allowlistedWindowTitleIncludes: titles.length > 0 ? [...titles] : ["Path of Exile 2"],
  });
  runtime.bindLiveSession({
    frameSource: createElectronFrameSource({
      capturer: options.capturer,
      clock: new SystemClock(),
      sourceNameIncludes: titles.length > 0 ? titles : ["Path of Exile 2"],
      requireNameMatch: true,
      thumbnailSize: {
        width: Math.round(1920 * scale),
        height: Math.round(1080 * scale),
      },
    }),
    perception: createLivePerceptionAdapter(process.queryProcess),
    createNativeSink: options.createNativeSink ?? createNativeSinkOrThrow,
    isProcessRunning: process.isProcessRunning,
  });
}
