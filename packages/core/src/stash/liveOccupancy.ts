import type { WorldState } from "../world-state/types.js";

export const LIVE_OCCUPANCY_PREFIX = "live-occ:";

export function isLiveOccupancyFingerprint(fingerprint: string | undefined): boolean {
  return fingerprint !== undefined && fingerprint.startsWith(LIVE_OCCUPANCY_PREFIX);
}

export function worldHasLiveDumpTokens(world: WorldState): boolean {
  if (
    world.inventory.value.cells.some(
      (cell) => cell.occupied && isLiveOccupancyFingerprint(cell.itemFingerprint),
    )
  ) {
    return true;
  }
  return Object.keys(world.flags.stashItemCatalog ?? {}).some((key) => isLiveOccupancyFingerprint(key));
}
