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


## 2026-10-02 底欄版式補正（18:17 PDT）

- 使用者指出底欄仍與其他書不同；直接對照 KTYD / YH 正式頁面，定位為按鈕缺少寬度上限、置中間距和明確選中底色，並非上一輪的浮鈕遮擋問題。
- 底欄改為置中、每項最多140px、6px間距、12px標籤及圓角選中底色；圖示與文字垂直居中；「善本」入口名稱統一為「關於」，頁內善本介紹保留。總高度66px加安全區，原浮鈕避讓／閱讀位置保持不變。
- runtime source：`9bfe32d382c49a97e32e493560831a764a226872`；正式版本：`ac188fe9-5c72-4926-8e0f-527cf2fc64b9`；deployment：`51a27088-9b50-4a92-b76f-032a2ea22adf`；實際生效：`2026-10-03T01:17:17.242549Z`。
- 回退版本：`22dc8517-d1d4-4e7d-9999-387feded7983`，按新基線重新建立受控交易；無資料遷移。
- `npm run verify` 7測試通過；134公開資產候選／正式逐檔一致；正式1280及390 CSS像素寬度無溢出，三頁籤狀態正確，閱讀位置690.5px往返保持。只改 index.html / styles.css，正文、App邏輯及私人筆記儲存未變。
- 證據與公開紀錄：`/Users/ylsuen/CF/reports/operations/zphlm-footer-align-20261002/REPORT.md`。
