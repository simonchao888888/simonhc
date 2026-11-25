// simonhc.com 的 Cloudflare Worker：直接讀 GitHub gh-pages 分支（由 deploy.yml 每次更新後自動產生）的檔案回給訪客。
// 網站更新流程：main 有新 commit → deploy.yml 建置並推到 gh-pages → 這個 Worker 5 分鐘內讀到新版本。
const ORIGIN = 'https://raw.githubusercontent.com/simonchao888888/simonhc/gh-pages';
const TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', webmanifest: 'application/manifest+json',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
        'cache-control': ext === 'html' ? 'public, max-age=300' : 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    });
    if (status === 200) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  },
};
