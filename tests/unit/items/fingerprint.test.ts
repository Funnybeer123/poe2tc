import { fingerprintItem, normalizeClipboardText, parseItem, withFingerprint } from "@poe2tc/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { itemFixturePath } from "../../helpers/fixturePaths.js";

function parsedFingerprints(rawText: string): string {
  const result = parseItem({
    rawText,
    source: "clipboard",
    capturedAtMs: 1,
  });
  if (!result.ok) {
    throw new Error(`expected parse success, got ${result.error}`);
  }
  return result.item.fingerprint;
}

describe("fingerprint stability", () => {
  it("is stable across parse order and whitespace-equivalent clipboard text", () => {
    const checkoutText = readFileSync(itemFixturePath("rare-ring.txt"), "utf8");
    const lf = normalizeClipboardText(checkoutText);
    const crlf = lf.replaceAll("\n", "\r\n");
    const windowsAutocrlfRewrite = crlf.replaceAll("\n", "\r\n");
    const trailingSpaces = lf
      .split("\n")
      .map((line) => (line.length === 0 ? line : `${line}  `))
      .join("\n");

    const first = parseItem({
      rawText: checkoutText,
      source: "fixture",
      capturedAtMs: 1,
    });
    const second = parseItem({
      rawText: crlf,
      source: "clipboard",
      capturedAtMs: 99,
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.item.fingerprint).toBe(second.item.fingerprint);
      expect(fingerprintItem(first.item)).toBe(first.item.fingerprint);
      expect(parsedFingerprints(windowsAutocrlfRewrite)).toBe(first.item.fingerprint);
      expect(parsedFingerprints(trailingSpaces)).toBe(first.item.fingerprint);
    }
  });

  it("changes when a modifier value changes", () => {
    const base = {
      class: "Ring",
      rarity: "rare",
      name: "Storm Grip",
      base: "Iron Ring",
      modifiers: [{ text: "+20 to Maximum Life", value: 20 }],
      pseudos: {},
    };
    const a = withFingerprint(base);
    const b = withFingerprint({
      ...base,
      modifiers: [{ text: "+21 to Maximum Life", value: 21 }],
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
