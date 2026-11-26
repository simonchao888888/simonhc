// simonhc.com 的 Cloudflare Worker：直接讀 GitHub gh-pages 分支（由 deploy.yml 每次更新後自動產生）的檔案回給訪客。
// 網站更新流程：main 有新 commit → deploy.yml 建置並推到 gh-pages → 這個 Worker 5 分鐘內讀到新版本。
const ORIGIN = 'https://raw.githubusercontent.com/simonchao888888/simonhc/gh-pages';
const TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', avif: 'image/avif', woff2: 'font/woff2', woff: 'font/woff', webmanifest: 'application/manifest+json',
};

// ---- 公開造訪統計（需要綁定 D1 資料庫 DB；沒綁定時回 503，網頁會顯示「暫未取得」，不影響其他功能）----
// 資料表見 cloudflare/visits.sql。計數用單一 SQL 的 +1 更新（原子操作），同時有人造訪也不會漏算。
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|linespider|preview|headless|lighthouse|pagespeed|curl|wget|python|httpclient|axios|node-fetch|go-http|java\//i;
const SRC = new Set(['facebook', 'instagram', 'line', 'threads', 'google', 'other-search', 'other', 'direct']);
const CLICK = new Set(['facebook', 'instagram', 'youtube', 'threads', 'line', 'email', 'share', 'feedback', 'leju']);
const FB_CATS = ['房價資料錯誤', '新聞及政策補充', '重大建設補充', '社區建案補充', '生活圈資訊補充', '網站操作問題', '希望新增的功能', '其他建議'];
const NOTIFY = 'https://formsubmit.co/ajax/simonchao888@gmail.com'; // 新回饋寄信通知站長（失敗不影響儲存）
const cleanPath = (p) => (typeof p === 'string' && /^\/[\w\-./%~]*$/.test(p) && p.length < 120 ? p : '');
const taipei = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString(); // Asia/Taipei 無夏令時間
const json = (o, status = 200, cc = 'no-store') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cc } });

async function ipHash(request, salt) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt)))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 用 Cache API 暫存的計數做限流（只存雜湊，不寫資料庫，時間到自動消失）
async function limited(ctx, origin, key, max, ttl) {
  const k = new Request(`${origin}/__rl/${key}`);
  const prev = await caches.default.match(k);
  const n = prev ? +(await prev.text()) + 1 : 1;
  ctx.waitUntil(caches.default.put(k, new Response(String(n), { headers: { 'cache-control': `max-age=${ttl}` } })));
  return n > max;
}
let ready = false;
async function ensureTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, cat TEXT NOT NULL, msg TEXT NOT NULL, email TEXT, page TEXT, status TEXT NOT NULL DEFAULT \'new\')'),
  ]);
  ready = true;
}
const bump = (env, k, v = 1, w = 0) => env.DB.prepare('INSERT INTO counters (k, visits, views) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET visits = visits + ?2, views = views + ?3').bind(k, v, w);

async function api(request, env, ctx, url) {
  if (!env.DB) return json({ error: 'stats-unavailable' }, 503);
  const t = taipei(), day = t.slice(0, 10), month = t.slice(0, 7);
  if (url.pathname === '/api/hit' && request.method === 'POST') {
    const ua = request.headers.get('user-agent') || '';
    const site = request.headers.get('sec-fetch-site');
    if (BOT.test(ua) || (site && site !== 'same-origin') || request.headers.get('purpose') === 'prefetch') return json({ ok: false, reason: 'filtered' }, 202);
    // 限流：同一 IP 每分鐘最多 30 次
    if (await limited(ctx, url.origin, 'hit/' + (await ipHash(request, day)) + '/' + t.slice(0, 16), 30, 60)) return json({ ok: false, reason: 'rate-limited' }, 429);
    let b;
    try { b = await request.json(); } catch { return json({ ok: false }, 400); }
    const v = b.v === 1 ? 1 : 0;
    const up = 'INSERT INTO counters (k, visits, views) VALUES (?1, ?2, 1) ON CONFLICT(k) DO UPDATE SET visits = visits + ?2, views = views + 1';
    const q = ['all', 'd:' + day, 'm:' + month].map((k) => env.DB.prepare(up).bind(k, v));
    const p = cleanPath(b.p);
    if (p) q.push(bump(env, `p:${month}:${p}`, v, 1));                       // 熱門頁面（瀏覽）與著陸頁（造訪）
    if (v) {
      const src = SRC.has(b.s) ? b.s : 'other';
      q.push(bump(env, `s:${day}:${src}`), bump(env, `s:${month}:${src}`));  // 來源（每次造訪算一次）
      q.push(bump(env, `r:${month}:${b.r === 1 ? 'return' : 'new'}`));       // 新訪客／回訪
    }
    await env.DB.batch(q);
    return json({ ok: true });
  }
  if (url.pathname === '/api/event' && request.method === 'POST') {
    const ua = request.headers.get('user-agent') || '';
    if (BOT.test(ua)) return json({ ok: false }, 202);
    if (await limited(ctx, url.origin, 'ev/' + (await ipHash(request, day)) + '/' + t.slice(0, 16), 20, 60)) return json({ ok: false }, 429);
    let b; try { b = await request.json(); } catch { return json({ ok: false }, 400); }
    if (!CLICK.has(b.c)) return json({ ok: false }, 400);
    await env.DB.batch([bump(env, `c:${month}:${b.c}`)]);
    return json({ ok: true });
  }
  if (url.pathname === '/api/feedback' && request.method === 'POST') {
    let b; try { b = await request.json(); } catch { return json({ ok: false, error: '格式錯誤' }, 400); }
    const ua = request.headers.get('user-agent') || '';
    // 防垃圾：機器人 UA、填了隱藏欄位、送出太快（少於 3 秒）、內容含 3 個以上網址 → 直接回成功但不儲存
    const elapsed = Date.now() - Number(b.t || 0);
    const links = ((b.msg || '').match(/https?:\/\//g) || []).length;
    if (BOT.test(ua) || b.hp || !(elapsed > 3000 && elapsed < 864e5) || links >= 3) return json({ ok: true });
    const cat = FB_CATS.includes(b.cat) ? b.cat : '';
    const msg = String(b.msg || '').trim().slice(0, 2000);
    const email = String(b.email || '').trim().slice(0, 120);
    if (!cat || msg.length < 5) return json({ ok: false, error: '請選擇分類並填寫至少 5 個字' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Email 格式不正確' }, 400);
    // 限流：同一 IP 10 分鐘內最多 3 則、一天最多 10 則
    const h = await ipHash(request, day);
    if (await limited(ctx, url.origin, 'fb10/' + h + '/' + t.slice(0, 15), 3, 600) || await limited(ctx, url.origin, 'fbday/' + h, 10, 86400)) return json({ ok: false, error: '送出太頻繁，請稍後再試' }, 429);
    await ensureTables(env);
    const page = cleanPath(b.page);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO feedback (at, cat, msg, email, page) VALUES (?1, ?2, ?3, ?4, ?5)').bind(t.slice(0, 19), cat, msg, email || null, page || null),
      bump(env, `f:${month}:${cat}`),
    ]);
    ctx.waitUntil(fetch(NOTIFY, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', referer: url.origin + '/feedback/', origin: url.origin },
      body: JSON.stringify({ _subject: `【新竹房產情報站】網站建議：${cat}`, _template: 'table', 分類: cat, 內容: msg, 回覆Email: email || '（未填）', 來自頁面: page || '（未填）', 時間: t.slice(0, 16).replace('T', ' ') }),
    }).catch(() => {}));
    return json({ ok: true });
  }
  if (url.pathname === '/api/stats' && request.method === 'GET') {
    const key = new Request(url.origin + '/api/stats#' + t.slice(0, 15)); // 約 1 分鐘快取
    const hit = await caches.default.match(key);
    if (hit) return hit;
    const { results } = await env.DB.prepare('SELECT k, visits, views FROM counters WHERE k IN (?1, ?2, ?3)').bind('all', 'd:' + day, 'm:' + month).all();
    const g = (k) => results.find((r) => r.k === k) || { visits: 0, views: 0 };
    const since = await env.DB.prepare("SELECT v FROM meta WHERE k = 'since'").first('v');
    const res = json({ visits: g('all').visits, views: g('all').views, today: g('d:' + day).visits, month: g('m:' + month).visits, since, asOf: t.slice(0, 19) }, 200, 'public, max-age=60');
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  }
  if (url.pathname === '/api/admin/summary' && request.method === 'GET') {
    if (!env.ADMIN_TOKEN || request.headers.get('authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
    await ensureTables(env);
    const m = url.searchParams.get('m') || month;
    const rows = (await env.DB.prepare("SELECT k, visits, views FROM counters WHERE k LIKE ?1 OR k LIKE ?2 OR k LIKE ?3 OR k LIKE ?4 OR k LIKE ?5").bind(`s:${m}%`, `p:${m}:%`, `r:${m}:%`, `c:${m}:%`, `f:${m}:%`).all()).results;
    const fb = (await env.DB.prepare('SELECT id, at, cat, msg, email, page, status FROM feedback ORDER BY id DESC LIMIT 100').all()).results;
    return json({ month: m, rows, feedback: fb });
  }
  if (url.pathname === '/api/stats/reset' && request.method === 'POST') {
    if (!env.ADMIN_TOKEN || request.headers.get('authorization') !== 'Bearer ' + env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
    await env.DB.batch([env.DB.prepare('DELETE FROM counters'), env.DB.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('since', ?1)").bind(day)]);
    return json({ ok: true, since: day });
  }
  return json({ error: 'not-found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, ctx, url); } catch (e) { return json({ error: 'stats-error' }, 503); }
    }
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }
    if (path.endsWith('/')) path += 'index.html';
    else if (!/\.[a-z0-9]+$/i.test(path)) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);

    const cache = caches.default;
    const key = new Request(url.origin + encodeURI(path));
    const hit = await cache.match(key);
    if (hit) return hit;

    let upstream = await fetch(ORIGIN + encodeURI(path), { cf: { cacheTtl: 300, cacheEverything: true } });
    let status = upstream.status;
    if (status !== 200) {
      upstream = await fetch(ORIGIN + '/404.html', { cf: { cacheTtl: 300, cacheEverything: true } });
      status = 404;
      path = '/404.html';
    }
    const ext = (path.split('.').pop() || '').toLowerCase();
    const res = new Response(upstream.body, {
      status,
      headers: {
        'content-type': TYPES[ext] || 'application/octet-stream',
        'cache-control': ext === 'html' ? 'public, max-age=300' : /^(avif|webp|jpg|png)$/.test(ext) ? 'public, max-age=604800' : 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    });
    if (status === 200) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
