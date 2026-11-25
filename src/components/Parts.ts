// 共用的小段 HTML 產生器（伺服器端建置時使用）
export function trendSvg(trend: [string, number, number][]) {
  if (trend.length < 2) return '<p class="note">樣本不足，暫不繪製趨勢。</p>';
  const W = 640, H = 230, P = { l: 44, r: 30, t: 16, b: 34 };
  const vals = trend.map((t) => t[2]);
  const mn = Math.floor(Math.min(...vals) - 2), mx = Math.ceil(Math.max(...vals) + 2);
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (trend.length - 1);
  const y = (v: number) => P.t + ((mx - v) * (H - P.t - P.b)) / (mx - mn);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = mn + ((mx - mn) * k) / 4;
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ece8df"/><text x="${P.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#7a8686">${v.toFixed(0)}</text>`;
  }
  const pts = trend.map((t, i) => `${x(i)},${y(t[2])}`).join(' ');
  const dots = trend.map((t, i) =>
    `<circle cx="${x(i)}" cy="${y(t[2])}" r="4" fill="#0f6e64"/><text x="${x(i)}" y="${y(t[2]) - 10}" font-size="12" text-anchor="middle" fill="#1d2a2a" font-weight="700">${t[2]}</text><text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#7a8686">${t[0]}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近幾季中古屋每坪中位數趨勢">${g}<polyline points="${pts}" fill="none" stroke="#0f6e64" stroke-width="2.5"/>${dots}</svg></div>`;
}

export const DISCLAIMER = `<div class="warn"><b>看行情前請注意：</b>中位數只代表「一半成交比它高、一半比它低」，同一區內新舊屋、大樓與透天差異很大。樣本少於 20 筆的區域請改看單筆實價；本站不提供估價或投資建議。</div>`;

export function faqItems(name: string): [string, string][] {
  return [
    [`${name}的房價中位數跟我看到的開價為什麼差很多？`, '開價是賣方期望，實價登錄是成交結果；另外新案、屋齡、樓層與是否含車位都會讓單價差很多，請找同社區或鄰近同屋齡物件比較。'],
    ['為什麼要扣除車位？', '車位常與房屋一起成交，若不扣除，總價會被車位價格灌水、單價失真。本站盡量扣除車位面積與價格；「車位未分離」的案件不納入單價統計。'],
    ['預售屋和中古屋可以直接比嗎？', '不行。預售屋是新建案、屋齡為零、公設比與建材不同，價格通常明顯較高，應分開比較。'],
    ['實價登錄多久更新？', '內政部每月 1、11、21 日揭露新資料；最近一兩個月的季度資料仍在累積，樣本會偏少。'],
  ];
}

export const faqLd = (items: [string, string][]) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

// 通用折線圖：[標籤, 數值][]
export function lineSvg(pts: [string, number][], digits = 2, label = '') {
  if (pts.length < 2) return '';
  const W = 640, H = 220, P = { l: 48, r: 34, t: 18, b: 34 };
  const vals = pts.map((p) => p[1]);
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.4 || 0.05;
  const mn = Math.min(...vals) - pad, mx = Math.max(...vals) + pad;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (pts.length - 1);
  const y = (v: number) => P.t + ((mx - v) * (H - P.t - P.b)) / (mx - mn);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = mn + ((mx - mn) * k) / 4;
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ece8df"/><text x="${P.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#7a8686">${v.toFixed(digits)}</text>`;
  }
  const line = pts.map((p, i) => `${x(i)},${y(p[1])}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[1])}" r="4" fill="#d9822b"/><text x="${x(i)}" y="${y(p[1]) - 10}" font-size="12" text-anchor="middle" font-weight="700" fill="#1d2a2a">${p[1].toFixed(digits)}</text><text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#7a8686">${p[0]}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${g}<polyline points="${line}" fill="none" stroke="#d9822b" stroke-width="2.5"/>${dots}</svg></div>`;
}
