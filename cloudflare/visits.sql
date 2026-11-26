-- 新竹房產情報站 公開造訪統計（Cloudflare D1）
-- 建立：wrangler d1 execute simonhc-visits --remote --file cloudflare/visits.sql
CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, visits INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- 統計開始日期＝正式啟用當天（不匯入、不灌水）
INSERT OR IGNORE INTO meta (k, v) VALUES ('since', strftime('%Y-%m-%d', 'now', '+8 hours'));
