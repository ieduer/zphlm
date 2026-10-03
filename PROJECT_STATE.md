## 2026-10-02 已部署並驗收

- 接受來源：`da0561a1e0044122d8f82d53398f0ea5ca88022a`（GitHub main 上已推送的 runtime source）。
- 正式版本：`22dc8517-d1d4-4e7d-9999-387feded7983`；deployment：`0683fd6e-a97b-4d43-888a-b3099bf682d8`。
- 實際生效時間：`2026-10-03T00:40:38.198371Z`。完整資產逐檔比對、既有測試、桌面與手機尺寸操作已通過。
- 回退：`6e6e5a4d-ad5d-4821-849f-bdab0999f186`，需依當前正式版本另立受控回退交易；本次沒有資料庫遷移。
- 單一操作報告：`/Users/ylsuen/CF/reports/operations/coread-reader-ux-20261002/REPORT.md`；公開紀錄狀態亦以該報告為準。

# PROJECT_STATE for `zphlm` (紅樓夢脂評匯校本)

## Current Status
- Target Domain: `zphlm.bdfz.net`
- Worker Name: `zphlm-reader`
- D1 Database: `zphlm-reactions` (`ead1c312-1ecd-4609-9745-85995f2e7847`)
- GitHub Repository: `ieduer/zphlm`
- Content State: 87 units (1 整理說明, 1 凡例, 80 回前八十回正文, 3 篇文獻附錄 [序跋/版本/靖藏批語150條], 1 校讀札記, 1 版權說明), 3,643 segments, 742,844 characters compiled in pure Traditional Chinese master verbatim format with zero omission.
- Verification State: All checks (`check:syntax`, `check:content`, `check:publication`, `check:config`, `test`) passing cleanly.

## Key Bindings
- `ASSETS`: `./public`
- `DB`: `zphlm-reactions` (`ead1c312-1ecd-4609-9745-85995f2e7847`)
- `CF_VERSION_METADATA`: Version tracking binding
- `USER_CENTER`: `bdfz-user-center`
- `GROWTH_EVIDENCE`: `bdfz-user-center` (`ZphlmGrowthEvidence`)

## Features & UX Standard
- 嚴格保留繁體善本原貌，杜絕機器繁簡轉換對人名、諧音、判詞、雙關語之損壞。
- 朱墨批語排版：朱紅（`#b91c1c` / `#991b1e`）標註，支援版本戳記（`甲戌本`、`庚辰本`等）與批語類型（`側批`、`眉批`、`夾批`等）。
- 支援通靈寶玉正反面插圖（WebP）及 29 幅生僻字手刻補字圖形。
- 現代閱讀器體驗：手機單行頂欄、Aa 設定面版（字號、行距、米白/宣紙/夜間主題、脂批顯示切換、安靜/共讀模式）、全書 87 章節即時檢索抽屜、心動榜、私人筆記與共讀評點。

## 2026-10-02 底欄版式補正（18:17 PDT）

- 使用者指出底欄仍與其他書不同；直接對照 KTYD / YH 正式頁面，定位為按鈕缺少寬度上限、置中間距和明確選中底色，並非上一輪的浮鈕遮擋問題。
- 底欄改為置中、每項最多140px、6px間距、12px標籤及圓角選中底色；圖示與文字垂直居中；「善本」入口名稱統一為「關於」，頁內善本介紹保留。總高度66px加安全區，原浮鈕避讓／閱讀位置保持不變。
- runtime source：`9bfe32d382c49a97e32e493560831a764a226872`；正式版本：`ac188fe9-5c72-4926-8e0f-527cf2fc64b9`；deployment：`51a27088-9b50-4a92-b76f-032a2ea22adf`；實際生效：`2026-10-03T01:17:17.242549Z`。
- 回退版本：`22dc8517-d1d4-4e7d-9999-387feded7983`，按新基線重新建立受控交易；無資料遷移。
- `npm run verify` 7測試通過；134公開資產候選／正式逐檔一致；正式1280及390 CSS像素寬度無溢出，三頁籤狀態正確，閱讀位置690.5px往返保持。只改 index.html / styles.css，正文、App邏輯及私人筆記儲存未變。
- 證據與公開紀錄：`/Users/ylsuen/CF/reports/operations/zphlm-footer-align-20261002/REPORT.md`。
