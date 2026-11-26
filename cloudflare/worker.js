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
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pagespeed|curl|wget|python|httpclient/i;
const taipei = (d = new Date()) => new Date(d.getTime() + 8 * 3600e3).toISOString(); // Asia/Taipei 無夏令時間
const json = (o, status = 200, cc = 'no-store') => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cc } });

async function api(request, env, ctx, url) {
  if (!env.DB) return json({ error: 'stats-unavailable' }, 503);
  const t = taipei(), day = t.slice(0, 10), month = t.slice(0, 7);
  if (url.pathname === '/api/hit' && request.method === 'POST') {
    const ua = request.headers.get('user-agent') || '';
    const site = request.headers.get('sec-fetch-site');
    if (BOT.test(ua) || (site && site !== 'same-origin') || request.headers.get('purpose') === 'prefetch') return json({ ok: false, reason: 'filtered' }, 202);
    // 限流：同一 IP 每分鐘最多 30 次（只用雜湊後的 IP 當暫存鍵，60 秒後自動消失，不寫入資料庫）
    const ip = request.headers.get('cf-connecting-ip') || '';
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + day)))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
    const rlKey = new Request(`${url.origin}/__rl/${h}/${t.slice(0, 16)}`);
    const prev = await caches.default.match(rlKey);
    const n = prev ? +(await prev.text()) + 1 : 1;
    ctx.waitUntil(caches.default.put(rlKey, new Response(String(n), { headers: { 'cache-control': 'max-age=60' } })));
    if (n > 30) return json({ ok: false, reason: 'rate-limited' }, 429);
    let v = 0;
    try { v = (await request.json()).v === 1 ? 1 : 0; } catch { return json({ ok: false }, 400); }
    const up = 'INSERT INTO counters (k, visits, views) VALUES (?1, ?2, 1) ON CONFLICT(k) DO UPDATE SET visits = visits + ?2, views = views + 1';
    await env.DB.batch(['all', 'd:' + day, 'm:' + month].map((k) => env.DB.prepare(up).bind(k, v)));
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
