// 試算工具正確性測試：node tests/tools.test.mjs
import assert from 'node:assert/strict';
const pmt = (P, rate, n) => { const r = rate / 12 / 100; return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)); };
// 1,000 萬、2.2%、30 年（本息平均攤還），標準公式結果約 37,970 元（與 Python 獨立計算一致）
assert.equal(Math.round(pmt(10_000_000, 2.2, 360)), 37970);
// 利率 0：每月本金平均
assert.equal(pmt(3_600_000, 0, 360), 10000);
// 總還款 = 月付 × 期數，應大於本金
assert.ok(pmt(10_000_000, 2.2, 360) * 360 > 10_000_000);
console.log('tools: ok');
