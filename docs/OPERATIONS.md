# zphlm operations

Source authority: `/Users/ylsuen/CF/sites/reading/zphlm`, `ieduer/zphlm`, main; accepted initial source `2c18b0c821d87c2e6d4cd4360ffe0c402a0b5937`. Registered managed-manual target: Cloudflare `zphlm-reader`, account `da810f08b63347a01d3db7fd42619972`, route `zphlm.bdfz.net/*`.

Runtime entry: `src/release-entry.js`; static assets: `public/`. D1 `zphlm-reactions` and both User Center bindings remain unchanged for the UI repair. No remote migrations or user-data mutation is part of this release.

Run `npm run verify` with Node 24.18.0; use the existing workspace Wrangler. Read current provider version/config and exact live public hashes before release; upload a source-tagged immutable candidate and verify with Cloudflare version override. Register exact evidence and use `scripts/release-worker-transaction.mjs` for same-version production promotion. Record live acceptance and a reviewed Status update under the workspace publishing policy. Immutable pre-change Worker version is the code rollback; never roll back D1 for a UI-only release.

UI acceptance: desktop/mobile footer, navigation/reading position, chapter/anchor loading, keyboard drawer/settings, local notes persistence/import/export. Preserve all chapter JSON and content indexes byte-for-byte. Personal notes stay device-local and source-edition-bound; blocked storage must say session-only.

Local disk profile: reuse existing source and toolchain; no dependency install. This bounded task uses 1 GiB incremental peak, 25 GiB reserve, private runtime manifest `reports/private/runtime-artifact-manifests/coread-reader-ux-20261002.json`. Task-owned preview/build outputs are removed after acceptance; release evidence is retained in `reports/operations/coread-reader-ux-20261002`. Run workspace disk-budget and artifact lifecycle checks. ENOSPC invalidates generated derivatives and blocks release.

Initial release version is recorded in the registry; current baseline and eventual accepted source/version/rollback are recorded in the linked task report, not inferred from the old version.
