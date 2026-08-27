import {
  liveOccupancyTransferObserved,
  transferObservedInCells,
} from "@poe2tc/core";
import { describe, expect, it } from "vitest";
import { inventoryCells, stashCells } from "../../helpers/stashWorld.js";

const pending = {
  fingerprint: "live-occ:inventory:0:0",
  from: { kind: "inventory" as const, x: 0, y: 0 },
  to: { kind: "stash" as const, tabId: "dump", x: 7, y: 0 },
  kind: "move" as const,
  attempts: 1,
  lastAttemptMs: 10_000,
  destTabId: "dump",
  reason: "Dump:dump",
};

describe("live-occ transfer confirm", () => {
  it("confirms a dump when the source cell is empty and the dest cell is occupied", () => {
    const inventory = inventoryCells([]);
    const stash = stashCells("dump", [{ x: 7, y: 0, fingerprint: "live-occ:stash:7:0" }], 12, 12);
    expect(liveOccupancyTransferObserved(pending, inventory, stash)).toBe(true);
    expect(transferObservedInCells(pending, inventory, stash)).toBe(true);
  });

  it("does not require the dest fingerprint to equal the inventory token", () => {
    const inventory = inventoryCells([]);
    const stash = stashCells("dump", [{ x: 7, y: 0 }], 12, 12);
    expect(transferObservedInCells(pending, inventory, stash)).toBe(true);
  });

  it("does not confirm when the source cell is still occupied", () => {
    const inventory = inventoryCells([{ x: 0, y: 0, fingerprint: "live-occ:inventory:0:0" }]);
    const stash = stashCells("dump", [{ x: 7, y: 0 }], 12, 12);
    expect(transferObservedInCells(pending, inventory, stash)).toBe(false);
  });

  it("keeps named-item confirm on fingerprint equality", () => {
    const named = {
      ...pending,
      fingerprint: "divine-1",
      to: { kind: "stash" as const, tabId: "currency", x: 0, y: 0 },
      destTabId: "currency",
    };
    expect(
      transferObservedInCells(
        named,
        inventoryCells([]),
        stashCells("currency", [{ x: 0, y: 0, fingerprint: "chaos-1" }]),
      ),
    ).toBe(false);
    expect(
      transferObservedInCells(
        named,
        inventoryCells([]),
        stashCells("currency", [{ x: 0, y: 0, fingerprint: "divine-1" }]),
      ),
    ).toBe(true);
  });
});
