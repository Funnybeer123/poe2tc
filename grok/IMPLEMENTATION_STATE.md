# Implementation State

**Updated:** 2026-08-27  
**Implementer:** Grok 4.6 xhigh Fast  
**Plan:** `plans/IMPLEMENTATION_PLAN.md` (Sol Max, 2026-08-27)

## Commits

| Ref | SHA | Notes |
| --- | --- | --- |
| Audited base (`main`) | `0f5b055a6d0a9f06b528b76f62538e8b93702c6a` | Windows PC (Evans) reproduced 378 pass / 2 fail on Vitest |
| Prior hotfix | `cursor/electron-compiled-exports-a0eb` | Compile workspace packages so Electron 40 can start on Windows |
| This branch | `cursor/qa-dry-run-toggle-280a` | Wire `POE2TC_DRY_RUN` + live stash scenario so authorized-qa can execute bag-to-stash |

## Active phase

Hotfix after Electron start: authorized-qa could only record intended clicks. `OperatorRuntime.defaultArming` hardcodes `dryRunDefault: true` and `operatorHost` never passed a way to turn it off. Interlock requires `scenario.executionMode === "live"` AND `arming.dryRunDefault === false`.

## This change

- `POE2TC_DRY_RUN=0`/`false` → `initialArming.dryRunDefault=false`. Unset / `1` / `true` stay true.
- QA dashboard can toggle session `dryRunDefault` (not persisted). Public companion cannot turn it off and still cannot emit native input.
- `fixtures/scenarios/stash-sort-live.json` (`executionMode: "live"`, inventory+stash) is seeded into authorized-qa operator scenarios only. Not auto-armed. Not seeded on public builds.
- Interlock gates unchanged: emergency stop, ack, arm, allowlist, live scenario, `dryRunDefault=false`.

## Completed phases

- Phase 01–15 as previously recorded.
- Windows Vitest host hotfix (`cursor/windows-test-host-fixes-1390`).
- Electron compiled-export start hotfix (`cursor/electron-compiled-exports-a0eb`).

## Build / test status

See this PR after the unit/integration gate. Default remains dry-run.

## Blockers

Unchanged:

- **BLOCKED: windows-vm**
- **BLOCKED: oauth-registration**
- **BLOCKED: poe-client-access** / **windows-native**

## Next exact work item

Evans: QA compile-time/runtime, `POE2TC_QA_ACKNOWLEDGED=1`, `POE2TC_DRY_RUN=0`, Arm, allowlisted PoE 2 window. Then `stash-sort-live` can execute bag-to-stash through the existing interlock + `GameInputController`.
