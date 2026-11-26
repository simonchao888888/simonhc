# QA_REPORT（2026-11-26，redesign 分支）

| 檢查 | 結果 |
|---|---|
| npm run build | 通過，614 頁 |
| 內部連結 | 0 失效 |
| JSON-LD 解析 | 全數通過 |
| 房貸公式（tests/tools.test.mjs） | 通過（1,000 萬、2.2%、30 年 = 37,970 元，與 Python 獨立計算一致） |
| 統計一致性（tests/consistency.py） | 通過：首頁、縣市頁、竹北頁、llms.txt 與 build.json 相同 |
| 手機 390px／桌機 1280px 水平溢出 | 首頁、竹北、預售、關於、重大建設皆無溢出 |
| 對比 | 主要文字 11.9、次要 5.1、連結 9.3、頁尾 5.1 以上，皆達 AA |
| 敏感資訊 | 原始碼無 API Key；Email 為公開聯絡信箱 |
| 尚未執行 | Lighthouse／Core Web Vitals 實測、螢幕閱讀器實測、Lint（專案未設定 ESLint） |

發現的問題：資料管線在內政部拒絕連線時仍照常發布（已修，重試＋中止）。
