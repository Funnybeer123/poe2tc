# Implementation State

**Updated:** 2026-08-27  
**Implementer:** Grok 4.6 xhigh Fast  
**Plan:** `plans/IMPLEMENTATION_PLAN.md` (Sol Max, 2026-08-27)

## Commits

| Ref | SHA | Notes |
| --- | --- | --- |
| Audited base (`main`) | `0f5b055a6d0a9f06b528b76f62538e8b93702c6a` | Windows PC (Evans) reproduced 378 pass / 2 fail on Vitest |
| This branch | `cursor/windows-test-host-fixes-1390` | Host-independent native-unavailable + CRLF-stable fingerprints |

## Active phase

Hotfix after Phase 15: Windows host test deviations. No architecture change.

## Completed phases

- Phase 01–15 as previously recorded.

## Build / test status

CI / this host: Node `v22.14.0`, Linux. Evans: Windows 11, Node `v24.16.0` (`win32`).

`package.json` `engines.node` relaxed from `>=22 <23` to `>=22 <25` so Node 24 is allowed. `.nvmrc` and CI remain Node 22. No test required Node 22 specifically.

## Windows test deviations and fixes

Evans cloned `main` and ran Vitest: **378 passed, 2 failed**. Both failures assumed a Linux CI host or LF-only checkout.

### 1. `tests/unit/input/nativeInputSink.test.ts`

**Failure.** `"throws native-unavailable when constructed on a non-Windows host"` expected `new NativeInputSink()` to throw. On Evans (`win32`) koffi loads, so construction is allowed.

**Cause.** The test used the default loader (`process.platform`) instead of injecting a non-Windows platform. Production behavior on Windows is correct.

**Fix.**

- Test now constructs with `platform: "linux"` / `"darwin"` and a loader that must not run.
- Default-constructor throw is still asserted when `process.platform !== "win32"` (Linux CI).
- `NativeInputSink` checks platform **before** loading koffi, matching `Win32ProcessQuery`. `native-unavailable` still throws on non-Windows and on koffi-load failure (existing win32 injected-loader test).

### 2. `tests/unit/items/fingerprint.test.ts`

**Failure.** Expected fingerprint `3e7a30a356d3b99325d52a3db489207222014ead8d34e4738da7cc2b1b0b9bad`, received `1ddb68f6b9ce159c6b6042b81889e5708f4cbdef1c9a09b12e1ca3323fbac0cb`.

**Cause (verified).** Not `fingerprintItem` itself. `parseItem` / `itemTextToSections` used `split(/\r?\n/)`. That is correct for LF and CRLF.

On a Windows checkout with CRLF fixtures, the test did `readFileSync(...).replaceAll("\n", "\r\n")`, which turns `\r\n` into `\r\r\n`. `split(/\r?\n/)` then leaves a trailing `\r` on every line (`"Item Class: Rings\r"`). Parsed modifier / header fields differ, so the SHA-256 fingerprint differs. Linux CI keeps LF fixtures, so the same `replaceAll` produces real CRLF and the test passed.

**Fix.**

- `normalizeClipboardText` converts `\r\n` and leftover `\r` to `\n` before sectioning.
- Lines are `trimEnd()`’d so trailing spaces are whitespace-equivalent.
- Fingerprint / parse tests now start from canonical LF and cover CRLF, the Windows autocrlf `\r\r\n` rewrite, and trailing spaces.
- `.gitattributes` sets `* text=auto eol=lf` so future Windows checkouts do not reintroduce CRLF fixture drift.

Fingerprints are therefore stable for equivalent clipboard text including CRLF on Windows and Linux.

## Blockers

Unchanged:

- **BLOCKED: windows-vm** — no Windows runner in this environment. Evans report used as the Windows evidence for these two tests.
- **BLOCKED: oauth-registration**
- **BLOCKED: poe-client-access** / **windows-native**

## Plan deviations

Phase 01–15 deviations unchanged.

This hotfix:

- Native unavailable test is host-independent; it no longer assumes Linux CI.
- Clipboard parse normalizes CR/LF before fingerprinting. No change to fingerprint canonical JSON fields.
- `engines.node` includes Node 24. Not required for the test fixes.

## Replay fixtures added

None. Item fixture `fixtures/items/rare-ring.txt` unchanged; newline variants are constructed in tests.

## Next exact work item

None in the Sol Max plan. Remaining work is external unblock: Windows VM pack/ABI, OAuth registration or test client, live PoE 2 client.
