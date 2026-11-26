# DATA_SOURCES 資料來源與授權

| 資料 | 來源 | 授權／條款 | 更新 | 程式 |
|---|---|---|---|---|
| 不動產買賣、預售屋、租賃實價登錄 | 內政部不動產交易實價查詢服務網 開放資料（季檔、每 10 天批次、本期） | 政府資料開放授權條款 | 每月 1、11、21 日公布，本站隔天抓取 | scripts/build_data.py、build_rent.py、build_rent_trend.py |
| 預售屋建案備查（起造人、戶數、建照） | 同上（buildcase 檔） | 同上 | 同上 | build_data.py |
| 建物買賣移轉登記棟數 | 內政部不動產資訊平台（內政統計月報） | 政府資料開放授權條款 | 每季，手動更新 src/data/transfers_official.json | — |
| 新竹市門牌坐標（分區對照） | 新竹市政府 政府資料開放平台 dataset 157547 | 政府資料開放授權條款 | 不定期 | scripts/data/hsinchu_city_roads.json |
| 央行利率、五大銀行房貸利率 | 中央銀行 | 公開資料 | 每月 | src/data/news.json |
| 新聞 | 各媒體原文 | 只摘要並附連結，不轉載全文 | 每週 | scripts/fetch_news.py |
| 重大建設 | 縣市政府公告與媒體報導（每項附來源） | 同上 | 每週檢查 | src/data/construction.json |

不使用：需登入、付費牆或禁止擷取的第三方網站資料（例如民間房產網站的成交筆數），即使筆數較多也不以其為準。
