/* 新竹房產情報站：公開造訪統計（低侵入、不用 Cookie、不做裝置指紋）
   - 造訪：以 30 分鐘無活動為一個工作階段；同一工作階段多頁只算一次造訪
   - 頁面瀏覽：每次實際顯示的頁面算一次；預載入（prerender）、機器人、無 JS 的請求不計
   - 本機只存「上次活動時間」與「最後一次成功取得的統計」，不存任何個人資料
   方法說明：/about-simonhc/#visits */
(function () {
  var API = '/api/', KEY = 'hc_last', CACHE = 'hc_stats', TIMEOUT = 30 * 60 * 1000;
  var ls = (function () { try { var t = '__t'; localStorage.setItem(t, t); localStorage.removeItem(t); return localStorage; } catch (e) { return null; } })();
  var bot = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed/i.test(navigator.userAgent) || navigator.webdriver;
  var fmt = function (n) { return typeof n === 'number' ? n.toLocaleString('zh-TW') : '—'; };

  function paint(s, state) {
    document.querySelectorAll('[data-visits]').forEach(function (box) {
      ['visits', 'today', 'month', 'views'].forEach(function (k) { var el = box.querySelector('[data-k="' + k + '"]'); if (el) el.textContent = s ? fmt(s[k]) : '—'; });
      var st = box.querySelector('[data-k="state"]'); if (st) st.textContent = state;
      var since = box.querySelector('[data-k="since"]'); if (since && s && s.since) since.textContent = s.since.replace(/-/g, '/');
    });
  }
  function cached() { try { return JSON.parse(ls && ls.getItem(CACHE)); } catch (e) { return null; } }
  function load() {
    fetch(API + 'stats', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw r.status; return r.json(); })
      .then(function (s) {
        if (ls) ls.setItem(CACHE, JSON.stringify({ s: s, at: Date.now() }));
        paint(s, '統計時間 ' + (s.asOf || '').slice(11, 16) + '（台北時間）');
      })
      .catch(function () {
        var c = cached();
        if (c && c.s) paint(c.s, '統計服務暫時無法連線，顯示 ' + new Date(c.at).toLocaleString('zh-TW', { hour12: false }).slice(0, -3) + ' 的數字');
        else paint(null, '統計暫未取得');
      });
  }
  function hit() {
    if (bot || !ls) return Promise.resolve();
    var now = Date.now(), last = +ls.getItem(KEY) || 0, newVisit = now - last > TIMEOUT;
    ls.setItem(KEY, String(now));
    var body = JSON.stringify({ v: newVisit ? 1 : 0, p: location.pathname });
    return fetch(API + 'hit', { method: 'POST', body: body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(function () {});
  }
  function go() { hit().then(load); }
  if (document.prerendering) document.addEventListener('prerenderingchange', go, { once: true });
  else if (document.visibilityState === 'hidden') document.addEventListener('visibilitychange', function f() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); go(); } });
  else go();
})();
