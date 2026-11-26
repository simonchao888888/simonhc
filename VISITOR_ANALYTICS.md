# 公開造訪統計

## 架構
- 前端 `public/visits.js`：頁面實際顯示後送一次 `POST /api/hit`（`{v:0|1}`，30 分鐘無活動算新造訪），再 `GET /api/stats` 顯示。不用 Cookie、不做指紋；localStorage 只存上次活動時間與最後一次成功的統計。
- Worker `cloudflare/worker.js` 的 `/api/*`：
  - `POST /api/hit`：過濾機器人 UA、跨站請求與預載入；同一 IP（SHA-256 雜湊、只在快取存 60 秒）每分鐘上限 30 次；用 D1 `INSERT … ON CONFLICT DO UPDATE SET n = n + 1` 原子更新三列：`all`、`d:YYYY-MM-DD`、`m:YYYY-MM`（台北時間）。
  - `GET /api/stats`：唯讀，快取約 60 秒。
  - `POST /api/stats/reset`：需要 `Authorization: Bearer <ADMIN_TOKEN>`。
- 資料表：`cloudflare/visits.sql`。

## 故障處理
沒綁 D1、資料庫錯誤 → 回 503，網頁顯示最後一次成功數字與時間，沒有就顯示「統計暫未取得」，網站其他功能不受影響。

## 啟用步驟（需要站長同意：會在 Cloudflare 帳號新增 D1 資料庫，免費額度內）
1. Cloudflare → Storage & Databases → D1 → 建立 `simonhc-visits`。
2. 在 D1 主控台執行 `cloudflare/visits.sql`。
3. Worker → Settings → Bindings → D1 database，變數名稱 `DB`。
4. （選用）Worker → Settings → Variables → Secret `ADMIN_TOKEN`。
5. 把新版 `cloudflare/worker.js` 貼到 Worker 並部署。

## 成本
D1 免費方案：每天 500 萬次讀取、10 萬次寫入、5 GB。每次瀏覽寫入 3 列；每天約 3 萬次瀏覽以內不用付費。
