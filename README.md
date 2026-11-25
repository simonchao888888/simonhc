# 竹房知識站（新竹縣市房地產知識平台）

只聚焦新竹市、新竹縣的房價行情與買房知識網站。Astro 靜態網站，每個行政區都有獨立網址，資料每旬自動更新。

## 網址結構

| 頁面 | 網址 |
|---|---|
| 首頁 | `/` |
| 查房價總覽 | `/region/` |
| 縣市頁 | `/region/hsinchu-city/`、`/region/hsinchu-county/` |
| 行政區頁（16 區） | `/region/hsinchu-county/zhubei/`、`/region/hsinchu-city/east/` … |
| 預售行情 | `/presale/` |
| 試算工具 | `/tools/affordability/`、`/tools/total-cost/`、`/tools/mortgage-payment/`、`/tools/rent-vs-buy/` |
| 買房指南 | `/guide/`、`/guide/{文章}/`、`/tag/{主題}/` |
| 其他 | `/areas/`、`/sources/`、`/about/`、`/sitemap-index.xml`、`/robots.txt` |

每頁都有 title／description／canonical／OG，以及麵包屑、FAQ、文章的結構化資料（JSON-LD）。

## 本機開發

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 輸出到 dist/
```

## 資料

- `src/data/seed.json`：首版數據與各區介紹文字（區域介紹、重點、預售新聞數字都在這裡改）。
- `src/data/build.json`：資料管線輸出，有內容時自動覆蓋 seed 的數字；為 `null` 時使用 seed。
- 更新資料：`npm run data`（執行 `scripts/build_data.py`，從內政部實價登錄下載新竹市 O、新竹縣 J 的季資料並計算中位數）。
  - 若下載失敗，可手動到「內政部不動產成交案件實際資訊資料供應系統」下載季資料 zip，放到資料夾後執行
    `python3 scripts/build_data.py --local ./zips`（檔名改成 `115S3.zip` 這種季別格式）。

## 預售建案成交明細（棟別、樓層、坪數、車位拆分）

`npm run data` 會同時輸出：

- `src/data/build.json`：各區中位數、每個預售建案統計（含起造人，若內政部檔案有預售屋備查資料）
- `src/data/presale_deals.json`：每個預售建案的每一筆成交（棟及號、移轉層次、總樓層、格局、權狀坪數、車位坪數、扣車位房屋坪數、主建物面積、總價、車位價、房屋價、單價、車位類別與所在樓層、備註、解約情形）

網站的每個建案頁會自動出現：車位價格拆分、各房型坪數與總價、樓層單價、銷控推估表、全部成交明細（可依房型篩選）。
尚未接上資料時，`/presale/sample/` 是用模擬資料做的版面示範。

**最快的做法**：在自己電腦的專案資料夾執行

```bash
npm run data && npm run build
```

（或推上 GitHub 後到 Actions 手動執行「Update data」。）

## 新增文章

在 `src/content/guide/` 新增一個 `.md` 檔，開頭填：

```yaml
---
title: 文章標題
description: 一句話摘要
category: 買房知識   # 買房知識／房貸知識／稅費與法律／房東與投資／市場分析
tags: [首購族, 房貸]
pubDate: 2026-11-20
order: 10
---
```

存檔後自動出現在指南列表、主題頁與 sitemap。

## 部署（GitHub Pages，免費）

1. 在 GitHub 建立新專案，把這個資料夾推上去（分支 `main`）。
2. Settings → Pages → Source 選 **GitHub Actions**。
3. Settings → Secrets and variables → Actions → **Variables** 新增 `SITE_URL`（例如 `https://你的帳號.github.io` 或自訂網域）。
4. 推送後 `deploy.yml` 會自動建置並發布。

> 用 Cloudflare Pages 或 Netlify 也可以：建置指令 `npm run build`、輸出資料夾 `dist`，環境變數設 `SITE_URL`。
> 若部署在子路徑（`https://帳號.github.io/專案名/`），需在 `astro.config.mjs` 加上 `base`，建議直接用自訂網域。

## 自動更新

`.github/workflows/update-data.yml` 在每月 2、12、22 日台灣時間上午 10 點（實價登錄揭露隔天）執行資料管線，有變動就提交，完成後自動觸發重新部署。也可以在 GitHub 的 Actions 頁手動按「Run workflow」。

## 上線前待辦

- [ ] `about.astro` 填入聯絡信箱
- [ ] 第一次執行 `npm run data`，確認新竹市東區／北區／香山區的中位數出現
- [ ] 設定 `SITE_URL` 並到 Google Search Console 提交 sitemap
- [ ] 補齊指南文章（規劃主題：權狀與謄本、看屋驗屋、學區、竹科通勤、管理費、賣屋換屋）

## 「寄給站長」提問表單（Email）

交流平台的提問表單用 FormSubmit 寄信（免費、不需要後端），設定在 `src/data/community.json` 的 `form`。

1. 第一次有人送出時，FormSubmit 會寄一封「Activate Form」到站長信箱，點一下就啟用（已於 2026/11/24 觸發，請到 simonchao888@gmail.com 收信啟用）。
2. 啟用後每則提問都會以表格寄到信箱；讀者有填 Email 的話，直接按「回覆」就能回給對方。
3. 想隱藏信箱：啟用信裡會有一組隨機代碼網址，把 `endpoint` 換成那組網址即可。
4. 送出後讀者會被帶回 `/community/thanks/`，網址取自 `SITE_URL`，部署時記得設定。

## 自動化內容流程

房市不是每天變動，所以主要流程是**每週一次**（可改成兩週一次）：

| 什麼時候 | 做什麼 | 檔案 |
|---|---|---|
| 每週一 07:00 | 一次完成：新聞標題 → 實價登錄（季檔＋每 10 天最新批次，含預售屋每戶成交）→ 租金 → 「新竹房市週報」直接發布 → 新聞判讀草稿開 PR | `weekly.yml`、`scripts/weekly_report.py` |
| 隨時（開 Issue 加「觀點」標籤） | 用你寫的看法產生判讀草稿，開 PR 並回覆 Issue | `commentary.yml`、`scripts/draft_commentary.py` |
| 每月 22 日 12:00 | 挑最近成交最多的建案，產生「建案拆解」草稿，開 PR | `case-study.yml`、`scripts/case_study.py` |
| 需要時手動 | 單獨更新新聞或資料 | `update-news.yml`、`update-data.yml`（Actions 頁面按 Run workflow） |

**改成兩週一次**：Settings → Secrets and variables → Actions → Variables，新增 `UPDATE_EVERY_WEEKS`，值填 `2`。
**想馬上更新一次**（例如央行理監事會當天）：Actions → Weekly update → Run workflow。

週報只有數字與新聞標題，所以自動發布；每期數字存在 `src/data/snapshots/`，下一期拿來比較漲跌。
**所有 AI 草稿都不會直接上線**，一律開成 Pull Request，站長審閱、修改後按 Merge 才會發布。

### 第一次設定

1. 到 [Anthropic Console](https://console.anthropic.com/) 申請 API 金鑰。
2. GitHub 專案 → Settings → Secrets and variables → Actions → New repository secret，名稱 `ANTHROPIC_API_KEY`。
3. Settings → Actions → General → Workflow permissions，勾選「Allow GitHub Actions to create and approve pull requests」。
4. 在 Issues → Labels 新增一個叫「觀點」的標籤。
5. 想換模型：Settings → Variables 新增 `MODEL`（預設 `claude-sonnet-5-5`），並在 `commentary.yml` 的 env 加上 `MODEL: ${{ vars.MODEL }}`。

### 讓判讀更像你

編輯 `editorial/viewpoint.md`：你的立場、常用判斷、語氣、絕對不做的事。每次產生草稿都會把整份檔案交給 AI。
你在 PR 裡改過的判讀，也可以挑幾則好的補進檔案最後的「判讀範例」，草稿會越來越像你。

### 看到新聞當下記錄想法

用手機 GitHub App 開一個 Issue：標題貼新聞網址，內文寫幾句你的看法，加上「觀點」標籤。
幾分鐘後會收到 PR 連結，草稿以你的看法為主軸，AI 只負責查證事實、補上新竹數字和潤稿。

## 上線（Cloudflare Pages）

Cloudflare Pages 連結 GitHub 後，每次 main 有新的 commit（包含每週自動更新、你 Merge 的判讀）都會自動重新建置發布，不需要其他設定。

- Framework preset：Astro
- Build command：`npm run build`
- Build output directory：`dist`
- Environment variables：`SITE_URL` = `https://simonhc.com`、`NODE_VERSION` = `22`
