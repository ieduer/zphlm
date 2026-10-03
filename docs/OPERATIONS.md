# zphlm operations

Source authority: `/Users/ylsuen/CF/sites/reading/zphlm`, `ieduer/zphlm`, main; accepted initial source `2c18b0c821d87c2e6d4cd4360ffe0c402a0b5937`. Registered managed-manual target: Cloudflare `zphlm-reader`, account `da810f08b63347a01d3db7fd42619972`, route `zphlm.bdfz.net/*`.

Runtime entry: `src/release-entry.js`; static assets: `public/`. D1 `zphlm-reactions` and both User Center bindings remain unchanged for the UI repair. No remote migrations or user-data mutation is part of this release.

Run `npm run verify` with Node 24.18.0; use the existing workspace Wrangler. Read current provider version/config and exact live public hashes before release; upload a source-tagged immutable candidate and verify with Cloudflare version override. Register exact evidence and use `scripts/release-worker-transaction.mjs` for same-version production promotion. Record live acceptance and a reviewed Status update under the workspace publishing policy. Immutable pre-change Worker version is the code rollback; never roll back D1 for a UI-only release.

UI acceptance: desktop/mobile footer, navigation/reading position, chapter/anchor loading, keyboard drawer/settings, local notes persistence/import/export. Preserve all chapter JSON and content indexes byte-for-byte. Personal notes stay device-local and source-edition-bound; blocked storage must say session-only.

Local disk profile: reuse existing source and toolchain; no dependency install. This bounded task uses 1 GiB incremental peak, 25 GiB reserve, private runtime manifest `reports/private/runtime-artifact-manifests/coread-reader-ux-20261002.json`. Task-owned preview/build outputs are removed after acceptance; release evidence is retained in `reports/operations/coread-reader-ux-20261002`. Run workspace disk-budget and artifact lifecycle checks. ENOSPC invalidates generated derivatives and blocks release.

Initial release version is recorded in the registry; current baseline and eventual accepted source/version/rollback are recorded in the linked task report, not inferred from the old version.

## 2026-10-02 已部署並驗收

- 接受來源：`da0561a1e0044122d8f82d53398f0ea5ca88022a`（GitHub main 上已推送的 runtime source）。
- 正式版本：`22dc8517-d1d4-4e7d-9999-387feded7983`；deployment：`0683fd6e-a97b-4d43-888a-b3099bf682d8`。
- 實際生效時間：`2026-10-03T00:40:38.198371Z`。完整資產逐檔比對、既有測試、桌面與手機尺寸操作已通過。
- 回退：`6e6e5a4d-ad5d-4821-849f-bdab0999f186`，需依當前正式版本另立受控回退交易；本次沒有資料庫遷移。
- 單一操作報告：`/Users/ylsuen/CF/reports/operations/coread-reader-ux-20261002/REPORT.md`；公開紀錄狀態亦以該報告為準。

