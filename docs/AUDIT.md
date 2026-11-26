# 現況盤點（2026-11-26）

範圍：simonhc.com 原始碼（Astro 靜態網站）、資料管線（Python）、排程（GitHub Actions）、部署（gh-pages + Cloudflare Worker）、SEO。

## 架構
- 前端：Astro 靜態輸出（`trailingSlash: always`、directory 格式），614 頁；無資料庫、無後端。
- 資料：`scripts/*.py` 依官方開放資料產生 `src/data/*.json`，提交到 Git（Git 本身就是資料備份與回復機制）。
- 排程：`update-data.yml`（每月 2、12、22 日）、`weekly.yml`（週一）、`commentary.yml`、`case-study.yml`、`fetch-raw.yml`（手動）。
- 部署：main 有提交 → `deploy.yml` build → 推 gh-pages → Cloudflare Worker 對外提供 simonhc.com。

## 功能分類

| 狀態 | 項目 |
|---|---|
| 已完成且正常 | 16 區房價（中古依屋齡、預售）、交易量、租金與逐年變化、預售建案逐戶成交（2019 起）、預售成交金額圖、房貸試算 4 種、新聞判讀、央行政策、週報、更新日曆、站內搜尋、sitemap、robots、麵包屑結構化資料、手機選單與底部導覽 |
| 已完成但需修正（本次已修） | 品牌名稱（竹房知識站→SimonHC）、指南署名寫 Simon 哥但為 AI 草稿、搜尋索引缺新竹市三區、資料管線下載失敗時仍照常發布、示範頁被收錄 |
| 部分完成 | 生活圈（7 大生活圈，尚無獨立網址與範圍定義）、重大建設（4 項，部分來源為媒體整理）、Simon 哥觀點（原創內容少） |
| 尚未建立 | 生活圈獨立專頁、社區（中古）資料庫、房價月報、年度白皮書、社群圖卡自動生成、管理後台、法拍資料、人口統計 |
| 因資料或權限限制 | GA4／Search Console（需本人帳號授權）、AI 新聞判讀自動草稿（需在 GitHub Secrets 填 ANTHROPIC_API_KEY）、讀者表單（需到信箱點 FormSubmit 啟用信）、TikTok／Threads／LINE 帳號（未提供）、新竹縣鄉鎮別官方移轉棟數（官方未公布） |
