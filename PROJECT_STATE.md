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
