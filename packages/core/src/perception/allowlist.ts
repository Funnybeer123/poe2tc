import type { QaArmingState } from "../capabilities/createCapabilities.js";

export const DEFAULT_ALLOWLISTED_PROCESS_NAMES = [
  "PathOfExile.exe",
  "PathOfExile_x64.exe",
  "PathOfExileSteam.exe",
] as const;

export const DEFAULT_ALLOWLISTED_WINDOW_TITLE_INCLUDES = ["Path of Exile 2"] as const;

export interface ProcessIdentity {
  name?: string;
  title?: string;
}

export function isProcessAllowlistedByArming(
  process: ProcessIdentity,
  arming: Pick<QaArmingState, "allowlistedProcessNames" | "allowlistedWindowTitleIncludes">,
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
};

/**
 * Overlay/dashboard focus must not abort a live dump. Keep the last allowlisted
 * PoE process when it is still running, or when that observation is still fresh.
 */
export function retainAllowlistedProcess<T extends ProcessObservation>(
  previous: T,
  incoming: T,
  arming: Pick<QaArmingState, "allowlistedProcessNames" | "allowlistedWindowTitleIncludes">,
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
  const stillPresent =
    pid !== undefined && isProcessRunning !== undefined
      ? isProcessRunning(pid)
      : previous.freshness === "fresh" || previous.freshness === "aging";
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
