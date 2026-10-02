# `zphlm` project instructions

Read the workspace-level `/Users/ylsuen/CF/AGENTS.md` and its required
Cloudflare and BDFZ runbooks before changing this project.

## Operating boundary

This directory is the deployable leaf for `zphlm.bdfz.net` (《紅樓夢脂評匯校本》八十回全本互動閱讀器). Work here must
not edit another reader, User Center, navigation, Pulse, or any
workspace-wide report/runbook without separate review.

The production resources are:

- Worker: `zphlm-reader`
- Custom domain: `zphlm.bdfz.net`
- Worker assets: `public/`, bound as `ASSETS`
- D1: `zphlm-reactions` (ID: `ead1c312-1ecd-4609-9745-85995f2e7847`), bound as `DB`
- User Center site key: `zphlm`
- GitHub repository: `ieduer/zphlm`

The D1 database contains reader reactions and public comments. Treat its raw
rows as user data: do not print comment text, names, slugs, UIDs, IP hashes, or
session material in logs, reports, commits, or chat.

## Source and Git authority

The deployable source authority is this standalone Git repository on `main`.

- Source EPUB: `/Users/ylsuen/Downloads/紅樓夢脂評匯校本_清_曹雪芹_著_脂硯齋_評_吳銘恩_匯校_z_library_sk,_1lib_sk,_z_li.epub`
- Total 87 units (1 整理說明, 1 凡例, 80 回前八十回正文, 3 篇文獻附錄, 1 校讀札記, 1 版權說明), 3,643 segments, 742.8k characters with zero omission.
- Strict Script Policy: Pure Traditional Chinese master text kept verbatim without lossy machine simplification.

## Toolchain

- Node: `24.18.0` (`.nvmrc` and `package.json#engines`)
- Wrangler: `^4.120.0`
- Python: `3.11+` with `Pillow`

## Verification commands

```sh
npm run verify
```
