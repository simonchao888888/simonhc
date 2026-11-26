# AUTOMATION 自動更新與排程

| 工作流程 | 時間（台灣） | 做什麼 |
|---|---|---|
| update-data.yml | 每月 2、12、22 日 10:00 | 抓內政部實價登錄（108S1 起季檔＋10 天批次＋本期），算房價、預售、租金、租金逐年；有變動才提交 |
| weekly.yml | 每週一 07:00（可設每兩週） | 新聞、資料、週報；有 ANTHROPIC_API_KEY 時產生新聞判讀草稿並開 PR 待審 |
| case-study.yml | 每月 22 日 | 建案拆解文章 |
| commentary.yml | 加「觀點」標籤的 Issue | 依站長觀點產生判讀草稿 PR |
| fetch-raw.yml | 手動 | 下載新竹縣市原始檔到 raw-lvr 分支，供核對 |
| deploy.yml | main 有提交 | build → gh-pages → Cloudflare Worker |

失敗處理：下載重試三次；主要檔案仍失敗就中止，不提交、不覆蓋上一版。GitHub Actions 頁面保留每次執行紀錄。
密鑰：ANTHROPIC_API_KEY 只放 GitHub Secrets，不進程式碼。
