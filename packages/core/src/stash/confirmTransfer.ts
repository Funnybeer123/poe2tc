import { locationKey, type ReconcileResult, type ShadowItem } from "../inventory/types.js";
import type { GridCell, PendingStashTransfer } from "../world-state/types.js";
import { isLiveOccupancyFingerprint } from "./liveOccupancy.js";

function sameLocation(
  left: ShadowItem["location"],
  right: ShadowItem["location"],
): boolean {
  return locationKey(left) === locationKey(right);
}

function cellLocation(
  kind: ShadowItem["location"]["kind"],
  cell: GridCell,
): ShadowItem["location"] {
  return { kind, tabId: cell.tabId, x: cell.x, y: cell.y };
}

export function fingerprintAt(
  cells: GridCell[],
  kind: ShadowItem["location"]["kind"],
  location: ShadowItem["location"],
): string | undefined {
  return cells.find(
    (cell) =>
      cell.occupied === true &&
      cell.itemFingerprint !== undefined &&
      cell.itemFingerprint.length > 0 &&
      sameLocation(cellLocation(kind, cell), location),
  )?.itemFingerprint;
}

function cellAt(
  cells: GridCell[],
  location: PendingStashTransfer["from"],
): GridCell | undefined {
  return cells.find((cell) => {
    if (cell.x !== location.x || cell.y !== location.y) {
      return false;
    }
    if (location.tabId !== undefined && cell.tabId !== undefined && cell.tabId !== location.tabId) {
      return false;
    }
    return true;
  });
}

/**
 * Live occupancy tokens change identity after a dump (`live-occ:inventory:x:y`
 * will not equal the dest token). Confirm those by occupancy flip only.
 */
export function liveOccupancyTransferObserved(
  pending: PendingStashTransfer,
  inventoryCells: GridCell[],
  stashCells: GridCell[],
): boolean {
  const destCells = pending.to.kind === "stash" ? stashCells : inventoryCells;
  const srcCells = pending.from.kind === "stash" ? stashCells : inventoryCells;
  const source = cellAt(srcCells, pending.from);
  const dest = cellAt(destCells, pending.to);
  const sourceEmpty = source === undefined || source.occupied !== true;
  const destOccupied = dest !== undefined && dest.occupied === true;
  return sourceEmpty && destOccupied;
}

export function transferObservedInCells(
  pending: PendingStashTransfer,
  inventoryCells: GridCell[],
  stashCells: GridCell[],
): boolean {
  if (isLiveOccupancyFingerprint(pending.fingerprint)) {
    return liveOccupancyTransferObserved(pending, inventoryCells, stashCells);
  }
  const destKind = pending.to.kind;
  const destCells = destKind === "stash" ? stashCells : inventoryCells;
  const srcCells = pending.from.kind === "stash" ? stashCells : inventoryCells;
  const atDest = fingerprintAt(destCells, destKind, pending.to) === pending.fingerprint;
  const stillAtFrom = fingerprintAt(srcCells, pending.from.kind, pending.from) === pending.fingerprint;
  return atDest && !stillAtFrom;
}

export function transferObserved(result: ReconcileResult, pending: PendingStashTransfer): boolean {
  if (isLiveOccupancyFingerprint(pending.fingerprint)) {
    const atDest = [...result.confirmed, ...result.unexpected].some((item) =>
      sameLocation(item.location, pending.to),
    );
    const stillAtFrom = [...result.confirmed, ...result.stale].some((item) =>
      sameLocation(item.location, pending.from),
    );
    return atDest && !stillAtFrom;
  }
  const atDest = [...result.confirmed, ...result.unexpected].some(
    (item) => item.fingerprint === pending.fingerprint && sameLocation(item.location, pending.to),
  );
  const stillAtFrom = [...result.confirmed, ...result.stale].some(
    (item) => item.fingerprint === pending.fingerprint && sameLocation(item.location, pending.from),
  );
  return atDest && !stillAtFrom;
}

/** Reclassify an expected move as confirmed so shadow success is observed, not assumed. */
export function applyExpectedTransfer(
  result: ReconcileResult,
  pending: PendingStashTransfer | null | undefined,
): ReconcileResult {
  if (pending === undefined || pending === null || pending.kind !== "move") {
    return result;
  }
  if (!transferObserved(result, pending)) {
    return result;
  }
  const destKey = locationKey(pending.to);
  const fromKey = locationKey(pending.from);
  const liveOcc = isLiveOccupancyFingerprint(pending.fingerprint);
  const moved = [...result.unexpected, ...result.confirmed].find((item) => {
    if (locationKey(item.location) !== destKey) {
      return false;
    }
    return liveOcc || item.fingerprint === pending.fingerprint;
  });
  const confirmed = result.confirmed
    .filter((item) => locationKey(item.location) !== destKey || (!liveOcc && item.fingerprint !== pending.fingerprint))
    .concat(moved === undefined ? [] : [{ ...moved, mismatch: false, stale: false }]);
  return {
    confirmed,
    unexpected: result.unexpected.filter((item) => {
      if (locationKey(item.location) !== destKey) {
        return true;
      }
      return !liveOcc && item.fingerprint !== pending.fingerprint;
    }),
    missing: result.missing.filter((item) => {
      if (locationKey(item.location) !== fromKey) {
        return true;
      }
      return !liveOcc && item.fingerprint !== pending.fingerprint;
    }),
    stale: result.stale,
  };
}
