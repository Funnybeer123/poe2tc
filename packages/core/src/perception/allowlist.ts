import type { QaArmingState } from "../capabilities/createCapabilities.js";

export const DEFAULT_ALLOWLISTED_PROCESS_NAMES = [
  "PathOfExile.exe",
  "PathOfExile_x64.exe",
  "PathOfExileSteam.exe",
] as const;

export const DEFAULT_ALLOWLISTED_WINDOW_TITLE_INCLUDES = ["Path of Exile 2"] as const;

export type AllowlistArming = Pick<
  QaArmingState,
  "allowlistedProcessNames" | "allowlistedWindowTitleIncludes"
>;

export interface ProcessIdentity {
  name?: string;
  title?: string;
  pid?: number;
}

export function isProcessAllowlistedByArming(
  process: ProcessIdentity,
  arming: AllowlistArming,
): boolean {
  const names = arming.allowlistedProcessNames;
  const titles = arming.allowlistedWindowTitleIncludes;
  const nameConfigured = names.length > 0;
  const titleConfigured = titles.length > 0;
  if (!nameConfigured && !titleConfigured) {
    return false;
  }

  const nameOk =
    !nameConfigured || (process.name !== undefined && names.includes(process.name));
  const titleOk =
    !titleConfigured ||
    (process.title !== undefined && titles.some((fragment) => process.title!.includes(fragment)));
  return nameOk && titleOk;
}

export type ProcessObservation = {
  value: ProcessIdentity & { allowlisted?: boolean; pid?: number };
  freshness: "fresh" | "aging" | "stale" | "missing";
  observedAtMs?: number;
};

/**
 * Overlay/dashboard may be foreground while PoE is still the test target.
 * Prefer an allowlisted window (FindWindow / last capture) over the overlay.
 */
export function resolveObservedProcess<T extends ProcessIdentity>(
  foreground: T,
  arming: AllowlistArming,
  findAllowlisted?: () => T | undefined,
): T {
  if (isProcessAllowlistedByArming(foreground, arming)) {
    return foreground;
  }
  const found = findAllowlisted?.();
  if (found !== undefined && isProcessAllowlistedByArming(found, arming)) {
    return found;
  }
  return foreground;
}

function observationStillFresh(observation: ProcessObservation): boolean {
  return observation.freshness === "fresh" || observation.freshness === "aging";
}

/**
 * Overlay/dashboard focus must not abort a live dump. Keep the last allowlisted
 * PoE process when that PID is still running or the last allowlisted
 * observation is still fresh/aging.
 */
export function retainAllowlistedProcess<T extends ProcessObservation>(
  previous: T,
  incoming: T,
  arming: AllowlistArming,
  isProcessRunning?: (pid: number) => boolean,
): T {
  const incomingListed = isProcessAllowlistedByArming(incoming.value, arming);
  if (incomingListed) {
    return {
      ...incoming,
      value: { ...incoming.value, allowlisted: true },
    };
  }

  const previousListed =
    previous.value.allowlisted === true &&
    previous.freshness !== "missing" &&
    isProcessAllowlistedByArming(previous.value, arming);
  if (!previousListed) {
    return {
      ...incoming,
      value: { ...incoming.value, allowlisted: false },
    };
  }

  const pid = previous.value.pid;
  const pidRunning =
    pid !== undefined && isProcessRunning !== undefined ? isProcessRunning(pid) === true : false;
  const stillPresent = pidRunning || observationStillFresh(previous);
  if (!stillPresent) {
    return {
      ...incoming,
      value: { ...incoming.value, allowlisted: false },
    };
  }

  return {
    ...previous,
    value: { ...previous.value, allowlisted: true },
  };
}
