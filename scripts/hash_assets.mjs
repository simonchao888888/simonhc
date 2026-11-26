// 建置後把 site.js、visits.js 複製成帶內容雜湊的檔名（name.<hash>.js），並改寫所有 HTML 的引用。
// 這樣更新後訪客一定拿到新版，不受邊緣快取影響。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const D = 'dist';
const map = {};
for (const name of ['site', 'visits']) {
  const src = readFileSync(join(D, `${name}.js`));
  const h = createHash('md5').update(src).digest('hex').slice(0, 10);
  writeFileSync(join(D, `${name}.${h}.js`), src);
  map[name] = h;
}
let n = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.html')) { const t = readFileSync(p, 'utf8'); const u = t.replace(/\/(site|visits)\.js(\?v=[a-z0-9]+)?"/g, (_, k) => `/${k}.${map[k]}.js"`); if (u !== t) { writeFileSync(p, u); n++; } } } };
walk(D);
console.log(`site.${map.site}.js、visits.${map.visits}.js（改寫 ${n} 個頁面）`);
