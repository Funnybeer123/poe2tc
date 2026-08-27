# Implementation State

**Updated:** 2026-08-27  
**Implementer:** Grok 4.6  
**Plan:** `plans/IMPLEMENTATION_PLAN.md` (Sol Max, 2026-08-27)

## Commits

| Ref | SHA | Notes |
| --- | --- | --- |
| Prior branch | `cursor/qa-dry-run-toggle-280a` | `POE2TC_DRY_RUN` + `stash-sort-live` seed only |
| This branch | `cursor/qa-live-stash-tick-0c9f` | Wire authorized-qa live tick: capture → orchestrator → NativeInputSink |

## Active phase

Hotfix after dry-run toggle: Arm still did not tick `DefaultScenarioOrchestrator` against a live frame. Replay remained the only caller of `createAutomationLoop`. `createInputSink` stayed Forbidden/Noop. `LivePerceptionAdapter` did not populate inventory/stash. `NativeInputSink` was unused.

## This change

- After Arm in authorized-qa, `OperatorRuntime` starts `LiveAutomationLoop` (existing orchestrator + `stash-sort-live`).
- Desktop QA path dynamically loads `liveLoopHost` (not `electron-main`): `ElectronFrameSource` + `LivePerceptionAdapter` + `NativeInputSink` factory.
- `createLiveInputSink` constructs native only when `canEmitNativeInput && armed`. Public companion stays Forbidden and never calls the factory.
- Replay still hard-codes `NoopInputSink` and refuses non-noop sinks.
- `LivePerceptionAdapter` runs `detectGrids` with `DEFAULT_INVENTORY_GRID` / `DEFAULT_STASH_GRID`. A detected full bag gets provisional `live-occ:` Dump tokens so a full bag + open stash can produce `stash-move`. Observe-then-confirm is unchanged.
- Hidden worker and dashboard show live-loop status. Emergency stop still trips `Ctrl+Shift+F12`, cancels the sink, and stops the live interval.
- Public pack excludes `liveLoopHost.js`. Public start never imports `@poe2tc/native-input`.

## Completed phases

- Phase 01–15 as previously recorded.
- Windows Vitest host hotfix.
- Electron compiled-export start hotfix.
- Dry-run env + live scenario seed.
- Live tick wiring (this branch).

## Build / test status

See this PR after the unit/integration/replay gate.

## Decision record

- Live ticks run in the Electron main process (250ms). The hidden worker is a status surface; Chromium throttles hidden renderers.
- `createInputSink` stays Forbidden/Noop. Only the live factory may construct `NativeInputSink`.
- Default bag/stash geometry is the existing placeholder, not a calibrated PoE 2 layout.
- Full-bag item identity uses occupancy tokens + Dump. Clipboard hover/OCR identities are still the confirmed path.

## Blockers

Unchanged external blockers:

- **BLOCKED: windows-vm** — this host cannot run the Electron+SendInput path against a real PoE 2 client.
- **BLOCKED: oauth-registration**
- **BLOCKED: poe-client-access** / **windows-native** — `NativeInputSink` and `Win32ProcessQuery` require win32. Off-Windows the native factory throws and the live loop falls back to Noop.

New honest gaps on the live stash path:

- **BLOCKED: live-grid-calibration** — `DEFAULT_INVENTORY_GRID` / `DEFAULT_STASH_GRID` are placeholder rectangles. Occupancy on Evans' actual 1920x1080 bag/stash will be wrong until those origins/cell sizes are measured from a live client screenshot.
- **BLOCKED: live-item-identity** — pixels still do not parse item text. Full-bag moves use `live-occ:inventory:x:y` Dump tokens. Hover+clipboard fingerprinting still needs a cursor-to-cell mapping (not implemented). OCR is not wired.
- **BLOCKED: live-hover-clipboard** — `detectGrids` can apply a hover fingerprint, but live capture does not know which cell is hovered and does not send Ctrl+C.

## Next exact work item

On Evans (Windows): QA compile-time/runtime, `POE2TC_QA_ACKNOWLEDGED=1`, `POE2TC_DRY_RUN=0`, focus the Path of Exile 2 window, Arm. Confirm the dashboard live loop is running and traces show `stash-sort-live` ticks. If occupancy is empty/wrong, calibrate grid geometry from a screenshot before expecting a real bag-to-stash drag.
