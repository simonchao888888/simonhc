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

## 上線（目前架構）

```
main 有新 commit（你 Merge、每週更新）
  → .github/workflows/deploy.yml 建置網站，推到 gh-pages 分支
  → Cloudflare Worker「simonhc」讀 gh-pages 分支的檔案回給訪客（約 5 分鐘內更新）
  → https://simonhc.com（www.simonhc.com 會自動轉到這裡）
```

- Worker 程式碼：`cloudflare/worker.js`（在 Cloudflare 後台 Workers 和 Pages → simonhc 編輯）
- 網域：Cloudflare → simonhc Worker → 網域，已綁定 simonhc.com、www.simonhc.com
- 全部免費：GitHub Actions（公開專案）、Cloudflare Workers 免費方案（每天 10 萬次請求）

### 備用：改用 Cloudflare Pages

Cloudflare Pages 連結 GitHub 後，每次 main 有新的 commit（包含每週自動更新、你 Merge 的判讀）都會自動重新建置發布，不需要其他設定。

- Framework preset：Astro
- Build command：`npm run build`
- Build output directory：`dist`
- Environment variables：`SITE_URL` = `https://simonhc.com`、`NODE_VERSION` = `22`
