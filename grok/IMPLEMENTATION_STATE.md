# Implementation State

**Updated:** 2026-08-27  
**Implementer:** Grok 4.6 xhigh Fast  
**Plan:** `plans/IMPLEMENTATION_PLAN.md` (Sol Max, 2026-08-27)

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
