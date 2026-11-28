/* SimonHC 新竹房產情報站：選單、站內搜尋、頁面小功能（不依賴任何套件） */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 主選單 ---------- */
  function closeGroups(except) {
    $$('.grp').forEach(function (g) { if (g !== except) { g.classList.remove('open'); $('.gbtn', g).setAttribute('aria-expanded', 'false'); } });
  }
  function setMenu(open) {
    var hd = $('.hd'); if (open && hd) document.documentElement.style.setProperty('--drawer-top', Math.max(0, hd.getBoundingClientRect().bottom) + 'px');
    document.body.classList.toggle('menu-open', open);
    var b = $('.menubtn'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function bindHeader() {
    $$('.gbtn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var g = btn.parentNode, open = !g.classList.contains('open');
        closeGroups(g); g.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.grp')) closeGroups(); });
    var mb = $('.menubtn');
    if (mb) mb.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
    $$('#mainnav a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); closeGroups(); }); });
  }

  /* ---------- 站內搜尋 ---------- */
  var INDEX = null, loading = null, results = [], sel = 0;
  var POPULAR = ['竹北市', '新竹市', '竹東鎮', '租金行情', '房貸月付', '寬限期', '房屋稅', '學區'];
  var KIND_ORDER = { '區域': 0, '生活圈': 1, '建案': 2, '頁面': 3, '重大建設': 4, '試算': 5, '文章': 6, '新聞': 7 };
  function norm(s) { return String(s || '').toLowerCase().replace(/臺/g, '台').replace(/\s+/g, ''); }
  function load() {
    if (INDEX) return Promise.resolve(INDEX);
    if (window.__SEARCH) { INDEX = window.__SEARCH; return Promise.resolve(INDEX); }
    if (!loading) loading = fetch('/search.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }).then(function (d) { INDEX = d; return d; })
      .catch(function () { loading = null; var b = $('#srch-res'); if (b) b.innerHTML = '<div class="srch-empty">搜尋資料載入失敗，請檢查網路後再試一次。</div>'; return null; });
    return loading;
  }
  function score(it, terms) {
    var t = norm(it.t), all = t + '|' + norm(it.s) + '|' + norm(it.w), sc = 0;
    for (var i = 0; i < terms.length; i++) {
      var q = terms[i];
      if (all.indexOf(q) < 0) return -1;
      sc += t === q ? 100 : t.indexOf(q) === 0 ? 60 : t.indexOf(q) >= 0 ? 40 : 10;
    }
    return sc - (KIND_ORDER[it.k] || 0) * 2 - t.length * 0.1;
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark(text, terms) {
    var h = esc(text);
    terms.forEach(function (q) { if (q) h = h.split(esc(q)).join('<mark>' + esc(q) + '</mark>'); });
    return h;
  }
  function render(q) {
    var box = $('#srch-res'); if (!box) return;
    var terms = String(q || '').trim().split(/\s+/).filter(Boolean).map(norm);
    if (!terms.length) {
      results = [];
      box.innerHTML = '<div class="srch-hint"><b>大家常找</b><div>' + POPULAR.map(function (p) { return '<button type="button" data-q="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div></div>';
      $$('[data-q]', box).forEach(function (b) { b.addEventListener('click', function () { var i = $('#srch-q'); i.value = b.dataset.q; render(i.value); i.focus(); }); });
      return;
    }
    results = (INDEX || []).map(function (it) { return { it: it, s: score(it, terms) }; })
      .filter(function (x) { return x.s >= 0; }).sort(function (a, b) { return b.s - a.s; });
    // 每一類最多 6 筆，讓區域、建案、文章都看得到
    // 分類依「該類最符合的一筆」排序：搜「寬限期」時文章排前面，搜「竹北」時區域排前面
    var per = {}, best = {};
    results = results.filter(function (x) { per[x.it.k] = (per[x.it.k] || 0) + 1; if (!(x.it.k in best)) best[x.it.k] = x.s; return per[x.it.k] <= 6; })
      .sort(function (a, b) { return (best[b.it.k] - best[a.it.k]) || (b.s - a.s); }).map(function (x) { return x.it; });
    sel = 0;
    if (!INDEX) { box.innerHTML = '<div class="srch-empty">搜尋資料載入中…</div>'; return; }
    if (!results.length) {
      box.innerHTML = '<div class="srch-empty">找不到「' + esc(q) + '」。可以試試區域名稱（竹北、湖口）、建案名稱，或到<a href="' + href('/community/') + '">交流平台</a>直接問站長。</div>';
      return;
    }
    var html = '', last = '';
    results.forEach(function (it, i) {
      if (it.k !== last) { html += '<div class="srch-k">' + esc(it.k) + '</div>'; last = it.k; }
      html += '<a role="option" class="srch-it' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" href="' + href(it.u) + '"><b>' + mark(it.t, terms) + '</b><span>' + esc(it.s) + '</span></a>';
    });
    box.innerHTML = html;
    $$('.srch-it', box).forEach(function (a) {
      a.addEventListener('mousemove', function () { move(+a.dataset.i - sel); });
      a.addEventListener('click', function () { closeSearch(); });
    });
  }
  // 示範版把網址換成 #頁面代號；正式站原樣
  function href(u) { return window.__HREF ? window.__HREF(u) : u; }
  function move(d) {
    var its = $$('.srch-it'); if (!its.length) return;
    sel = (sel + d + its.length) % its.length;
    its.forEach(function (a, i) { a.classList.toggle('on', i === sel); });
    its[sel].scrollIntoView({ block: 'nearest' });
  }
  function openSearch(initial) {
    var w = $('#srch'); if (!w) return;
    w.hidden = false; document.body.classList.add('srch-open'); setMenu(false);
    var i = $('#srch-q'); i.value = initial || ''; render(i.value);
    setTimeout(function () { i.focus(); }, 10);
    load().then(function () { render(i.value); });
  }
  function closeSearch() { var w = $('#srch'); if (w) w.hidden = true; document.body.classList.remove('srch-open'); }
  function bindSearch() {
    var i = $('#srch-q'); if (!i) return;
    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-search-open]');
      if (o) { e.preventDefault(); var src = o.dataset.searchFrom ? $(o.dataset.searchFrom) : null; openSearch(src ? src.value : ''); }
      if (e.target.closest('[data-search-close]') || e.target.id === 'srch') closeSearch();
    });
    i.addEventListener('input', function () { render(i.value); });
    i.addEventListener('compositionend', function () { render(i.value); });
    i.addEventListener('search', function () { render(i.value); });
    i.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { var a = $$('.srch-it')[sel]; if (a) { e.preventDefault(); closeSearch(); location.href = a.getAttribute('href'); } }
    });
    document.addEventListener('keydown', function (e) {
      var typing = /input|textarea|select/i.test((e.target.tagName || '')) || e.target.isContentEditable;
      if (e.key === 'Escape') { closeSearch(); setMenu(false); closeGroups(); }
      else if (!typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); openSearch(''); }
    });
  }

  /* ---------- 每頁都要重新綁定的小功能（示範版切頁時會再呼叫一次） ---------- */
  function bindPage(root) {
    root = root || document;
    // 首頁搜尋列的熱門關鍵字
    $$('[data-hero-search] [data-q]', root).forEach(function (b) { b.addEventListener('click', function () { openSearch(b.dataset.q); }); });
    // 文章分類篩選
    $$('[data-filter]', root).forEach(function (bar) {
      var target = $(bar.dataset.filter, root); if (!target) return;
      $$('button', bar).forEach(function (b) {
        b.addEventListener('click', function () {
          $$('button', bar).forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          $$('[data-c]', target).forEach(function (el) { el.hidden = !(b.dataset.c === 'all' || el.dataset.c === b.dataset.c); });
        });
      });
    });
    // 文章目錄：捲動時標出目前段落
    var toc = $('.toc', root);
    if (toc && window.innerWidth < 1000) toc.removeAttribute('open');
    if (toc && 'IntersectionObserver' in window) {
      var links = $$('a', toc), map = {};
      links.forEach(function (a) { map[decodeURIComponent(a.getAttribute('href').split('#')[1] || '')] = a; });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && map[en.target.id]) { links.forEach(function (a) { a.classList.remove('on'); }); map[en.target.id].classList.add('on'); } });
      }, { rootMargin: '-80px 0px -70% 0px' });
      $$('.art h3[id]', root).forEach(function (h) { io.observe(h); });
      links.forEach(function (a) {
        a.addEventListener('click', function (e) {
          var h = document.getElementById(decodeURIComponent(a.getAttribute('href').split('#')[1]));
          if (h) { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
      });
    }
  }

  /* ---------- 回到頂端 ---------- */
  function bindTop() {
    var b = document.createElement('button');
    b.className = 'totop'; b.type = 'button'; b.setAttribute('aria-label', '回到頁首');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6" /></svg>';
    document.body.appendChild(b);
    b.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    var on = false;
    window.addEventListener('scroll', function () {
      var v = window.scrollY > 900; if (v !== on) { on = v; b.classList.toggle('show', v); }
      document.body.classList.toggle('scrolled', window.scrollY > 8);
    }, { passive: true });
  }

  function init() {
    var ca = $('.catnav a.on'); if (ca && ca.parentNode.scrollWidth > ca.parentNode.clientWidth) ca.parentNode.scrollLeft = ca.offsetLeft - ca.parentNode.clientWidth / 2 + ca.offsetWidth / 2;
    bindHeader(); bindSearch(); bindTop(); bindPage(document); }
  window.SiteUI = { bindPage: bindPage, openSearch: openSearch, closeSearch: closeSearch, closeMenu: function () { setMenu(false); closeGroups(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Email 按鈕：很多人電腦沒設定郵件程式，mailto 點了沒反應 → 改成跳出視窗，可選 Gmail、預設郵件程式或複製信箱
(function () {
  var dlg;
  function open(addr, subj) {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'mail-dlg';
      dlg.innerHTML = '<form method="dialog"><button class="x" aria-label="關閉">×</button></form>' +
        '<h3>寫信給 Simon 哥</h3><p class="addr"></p>' +
        '<div class="acts"><a class="btn p g" target="_blank" rel="noopener">用 Gmail 寫信</a>' +
        '<a class="btn s m">用電腦的郵件程式</a><button type="button" class="btn s c">複製信箱</button></div><p class="msg" aria-live="polite"></p>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }
    var q = subj ? '&su=' + encodeURIComponent(subj) : '';
    dlg.querySelector('.addr').textContent = addr;
    dlg.querySelector('.g').href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(addr) + q;
    dlg.querySelector('.m').href = 'mailto:' + addr + (subj ? '?subject=' + encodeURIComponent(subj) : '');
    var msg = dlg.querySelector('.msg'); msg.textContent = '';
    dlg.querySelector('.c').onclick = function () {
      var done = function () { msg.textContent = '已複製：' + addr; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(addr).then(done, function () { msg.textContent = '請手動複製：' + addr; });
      else { msg.textContent = '請手動複製：' + addr; }
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-mail]');
    if (!a) return;
    e.preventDefault();
    open(a.getAttribute('data-mail'), a.getAttribute('data-subject'));
  });
})();
