# 排盤正確性驗證

用公開的紫微斗數排盤函式庫 [iztro](https://github.com/SylarLong/iztro) v2.6.5 當參考答案，逐一比對本排盤程式的結果。

- 範圍：國曆 1950-01-01 至 2026-12-31 每一天 × 13 個時辰（早子到晚子），性別男女交替
- 命盤數：365,612 張
- 比對欄位：21,571,108 個
  - 命宮、身宮、五行局
  - 十二宮宮干、大限歲數
  - 十四主星位置
  - 左輔、右弼、文昌、文曲、天魁、天鉞、祿存、天馬、擎羊、陀羅、火星、鈴星、地空、地劫位置
  - 生年四化（庚干化科用太陰）
- 結果：**0 個不一致**

重跑方式（需 Playwright）：

```bash
npm i lunar-javascript@1.7.7 iztro@2.6.5
node ziwei/verify.js 1950 2026 out.json node_modules/lunar-javascript/lunar.js node_modules/iztro/dist/iztro.min.js
```

單一程序跑一年約 1 分鐘，可分段平行執行。
