# Implementation State

**Updated:** 2026-08-27  
**Implementer:** Grok 4.6 xhigh Fast  
**Plan:** `plans/IMPLEMENTATION_PLAN.md` (Sol Max, 2026-08-27)
**Verified tip:** `364acd3650ac6fec2e288565bfac974c92ac3e26` (`cursor/electron-compiled-exports-a0eb`, PR #2)

## Commits

| Ref | SHA | Notes |
| --- | --- | --- |
| Audited base (`main`) | `0f5b055a6d0a9f06b528b76f62538e8b93702c6a` | Windows PC (Evans) reproduced 378 pass / 2 fail on Vitest |
| Prior hotfix | `cursor/windows-test-host-fixes-1390` | Host-independent native-unavailable + CRLF-stable fingerprints |
| This branch | `cursor/electron-compiled-exports-a0eb` | Compile workspace packages so Electron 40 can start on Windows |

## Active phase

Hotfix after Phase 15: Windows Electron start. First `ERR_MODULE_NOT_FOUND` for core TS imports; then `ENOENT` on `apps/migrations` from compiled `dist/`. No architecture change.

## Completed phases

- Phase 01–15 as previously recorded.
- Windows Vitest host hotfix (`cursor/windows-test-host-fixes-1390`).

## Build / test status

CI / this host: Node `v22.14.0`, Linux. Evans: Windows 11, Node `v24.16.0` (`win32`).

This-host gate after the Electron start hotfix:

- `npm run lint` green
- `npm run typecheck` green
- `npm test` **390 passed** (compiled-export + repo-root / whenReady coverage)
- `npm run test:smoke` 7 passed
- `scripts/check-native-input-imports.mjs` OK
- public file-list verify OK
- `npm run build` green
- Node ESM: `import.meta.resolve("@poe2tc/core")` → `packages/core/dist/index.js`
- `tsc` emitted `packages/core/dist/operator/disclaimer.js` and the other operator modules
- xvfb Electron load: no `ERR_MODULE_NOT_FOUND`. Main then hit the existing `better-sqlite3` Electron ABI mismatch (`NODE_MODULE_VERSION` 127 vs 143). That is not this crash; rebuild remains `BLOCKED: windows-vm`.

## Windows Electron start crash

Evans launched desktop and got:

```
App threw an error during load
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../packages/core/src/operator/disclaimer.js'
imported from '.../packages/core/src/index.ts'
```

Electron dialog: "A JavaScript error occurred in the main process."

**Cause.** `@poe2tc/core` (and `@poe2tc/persistence-sqlite`) `package.json` `exports` pointed `import`/`default` at `./src/index.ts`. Electron 40 ESM follows `import "./operator/disclaimer.js"` from that TypeScript file; the `.js` sibling does not exist. Vitest compiles TS on the fly, so `npm test` stayed green.

**Fix.**

- Runtime `import`/`default` export conditions point at `dist/*.js`. `types` and `development` stay on `src/*.ts` so typecheck and Vitest keep working without a prior `tsc`.
- Existing `tsc -p tsconfig.json` build scripts emit JS. Verified `packages/core/dist/operator/disclaimer.js` and the other operator modules exist after `npm run build --workspace @poe2tc/core`.
- Root/`apps/desktop` `npm start` run `scripts/start-desktop.mjs`, which builds core, persistence-sqlite, overlay, then desktop, then launches Electron. No `tsx` in the Electron main process.
- `scripts/pack.mjs` uses the same runtime build order. Electron-builder file lists include `packages/*/dist/**`.
- Public-companion / authorized-QA boundaries unchanged. Desktop still depends only on core + persistence-sqlite.

Decision: compiled JS for Electron rather than adding a TypeScript loader to main.

## Windows `apps/migrations` ENOENT (Evans, after module-load fix)

Evans rebuilt `better-sqlite3` for Electron. Next crash:

```
ENOENT: no such file or directory, scandir
'.../Poe2 Full Bot/apps/migrations'
    at listMigrationFiles (.../packages/persistence-sqlite/dist/migrate.js)
    at applyMigrations
    at createDesktopRuntime (.../apps/desktop/dist/operatorHost.js)
```

**Cause.** `operatorHost.ts` used `path.resolve(desktopDir, "../..")`. That is repo root when `desktopDir` is `apps/desktop` (source). `tsc` emits to `apps/desktop/dist/`, so `../..` is `apps/` and migrations/fixtures resolve under `apps/`.

**Fix.**

- `resolveRepoRoot` walks upward until it finds sibling `migrations/` and `fixtures/` (source, `dist/`, and packaged layout).
- `app.whenReady()` uses `.catch(logDesktopReadyFailure)` so a boot throw is a logged `desktop-ready-failed` instead of an unhandled rejection.

## Windows test deviations (prior hotfix)

Unchanged from `cursor/windows-test-host-fixes-1390`: native-unavailable test is host-independent; clipboard parse strips leftover CR; `engines.node` is `>=22 <25`.

## Blockers

Unchanged:

- **BLOCKED: windows-vm** — no Windows runner. Evans report is the Windows evidence for the original `disclaimer.js` crash. This host proved compile + Node ESM resolve + xvfb Electron getting past module load (then sqlite ABI). A windowed Windows start was not claimed.
- **BLOCKED: oauth-registration**
- **BLOCKED: poe-client-access** / **windows-native**

## Plan deviations

Phase 01–15 deviations unchanged.

This hotfix:

- Workspace runtime exports target compiled JS. Tests still import TypeScript through the `development` export condition (Vite/Vitest). Node/Electron use `import` → `dist`.
- Start/pack always build the Electron-imported workspaces first.

## Replay fixtures added

None.

## Next exact work item

Confirm Evans `npm start` applies migrations from repo-root `migrations/` and no longer ENOENTs `apps/migrations`. Remaining external unblock: Windows VM pack/ABI, OAuth registration or test client, live PoE 2 client.

## Bot verification

**Host:** Linux cloud VM, Node `v22.14.0`, npm `10.9.7`. No Path of Exile 2 client, no Windows SendInput, no live game input. Replay + unit/integration/smoke are the proof.

**Verdict:** Bot decision/orchestration logic is working in replay. Every full-loop tick recorded intended actions with `executed === false` through `NoopInputSink`. Live Windows client QA remains BLOCKED.

### Commands (this run, 2026-08-27)

| Command | Result |
| --- | --- |
| `npm install` | exit 0; 477 packages added, 485 audited |
| `npm run lint` | exit 0; `eslint .` |
| `npm run typecheck` | exit 0; root `tsc --noEmit` plus desktop, overlay (`vue-tsc`), core, native-input, perception-live, persistence-sqlite, testkit |
| `npm test` | exit 0; **113 files / 390 passed** (320 unit, 32 integration, 38 replay); 12.49s |
| `npm run test:replay` | exit 0; **15 files / 38 passed**; 1.73s |
| `npm run test:smoke` | exit 0; **7 passed** (2.5s); Playwright Chromium overlay smoke |
| `node scripts/check-native-input-imports.mjs` | exit 0; `OK: no native input imports outside packages/native-input/**; koffi only in native-input and perception-live` |
| `npm run build:runtime` | exit 0; core, persistence-sqlite, overlay (Vite), desktop (`tsc`) |
| `packages/core/dist/operator/disclaimer.js` | exists after build (153 bytes); exports `GGG_DISCLAIMER` |
| `resolveRepoRoot(apps/desktop/dist)` | `/workspace`; `REPO_ROOT` matches; `migrations/001_init.sql` present; `createDesktopRuntime({ dbPath: ":memory:" })` applies migrations |

### Full-loop replay traces (compiled `@poe2tc/core` `dist/index.js`)

`runReplay` on `fixtures/replay/full-loop`: `result=end-of-stream`, `sinkKind=noop`, controller sink `noop`, every trace `executed=false` and `dryRun=true`, `interlockCode=dry-run`.

| Tick | State | Module | Decision | Intended input |
| --- | --- | --- | --- | --- |
| 1 | Follow | follow | `follow-target` | `mouse-click` 640,360 |
| 2 | LootPickup | loot | `pick:exalted-1` | `mouse-click` 700,350 |
| 3 | InventoryFull | stash | `stash-move:divine-1` | `mouse-drag` inventory → currency |
| 4 | StashSort | stash | `stash-move:chaos-1` | `mouse-drag` inventory → currency |
| 5 | StashSort | stash | `stash-plan-empty` | `noop` |
| 6 | Listing | listing | `listing-select-item` | `mouse-click` 1400,220 |
| 7 | TradeSession | trade | `trade-request-received` | `noop` |

Replay runner refuses a non-noop sink and throws if any trace has `executed === true`.

### Public-companion cannot emit native input

Compiled-dist check on this host:

- `createCapabilities("public-companion").canEmitNativeInput === false`
- `createInputSink` returns `ForbiddenInputSink` (`kind=forbidden`)
- Requested `kind=native` sink is replaced with `ForbiddenInputSink`
- `enqueue` of a live mouse-click: `executed=false`, `blockedReason=public-mode`, native spy `calls=0`

Default `createDesktopRuntime` on this host also starts as `public-companion` with `canEmitNativeInput=false`.

### What this proves

- Scheduler + orchestrator walk follow → loot → inventory full → stash → list → trade from fixture frames.
- Intended input is recorded; nothing is executed in replay (`NoopInputSink`, dry-run interlock).
- Public companion cannot emit native input even if a native sink is injected.
- Native input libraries stay behind `packages/native-input` (and `koffi` only there + `perception-live`).
- Compiled workspace JS exists so Electron can import `disclaimer.js`; repo root / migrations resolve from `apps/desktop/dist`.
- Overlay smoke covers disclaimer, QA banner, public arm disabled, replay view states, first-run QA ack, price-as-estimate.

### Remaining BLOCKED

- **windows live client / poe-client-access** — this VM cannot open Path of Exile 2 or send live game input. Do not treat replay as live QA.
- **electron-rebuild on each machine** — prior xvfb Electron load still hits `better-sqlite3` ABI (`NODE_MODULE_VERSION` 127 vs 143). Rebuild for the local Electron ABI on the Windows box; not done here.
- **oauth-registration** — no official PoE OAuth / trade API session. No `POESESSID`, no undocumented trade APIs added.

Safety held: QA/public boundaries unchanged; no live SendInput testing on this Linux host.
