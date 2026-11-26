import P from '../data/presale_projects.json';
import build from '../data/build.json';
import { districts } from './data';
import dealsRaw from '../data/presale_deals.json';
import sampleRaw from '../data/presale_sample.json';
import { createHash } from 'node:crypto';
import LJ from '../data/leju.json';

export interface Leju { url: string; n: number; sold?: number; total?: number; avg1y?: number; max?: number; min?: number }
// 本站統計一律以內政部開放資料為準；樂居的公開摘要只放在建案頁旁邊供參考（src='leju' 表示樂居筆數較多、官方尚未公布完）
export const lejuChecked: string = (LJ as any).checked;
const LJI = (LJ as any).items as Record<string, Leju>;
export const lejuFor = (r: string, dist: string, name: string): Leju | undefined => LJI[`${r}|${dist}|${name}`];
export const lejuSearch = (name: string, dist: string) => `https://www.google.com/search?q=${encodeURIComponent(`樂居 ${name} ${dist}`)}`;
export const useLeju = (l: Leju | undefined, n: number) => !!l && l.n > n;
export interface Project {
  lj?: Leju; moiN?: number; src?: 'leju' | 'moi';
  id: string; name: string; r: 'city' | 'county'; dist: string; dev: string; addr: string; units: number; permit: string; sales: string;
  med: number | null; min: number | null; max: number | null; medTotal: number | null; rooms: string; n: number; latest: string; first?: string; alias?: string[];
  status: string; note: string; sources: [string, string][];
}
export interface Row { name: string; r: 'city' | 'county'; dist: string; n: number; med: number | null; dev?: string; latest?: string; min?: number; max?: number; medTotal?: number }

const B: any = build;
// 資料管線有產出建案統計時，以管線為準
export const fromPipeline = !!(B && B.projects && B.projects.length);
// 預售屋最新簽約日：取每戶明細裡最晚的成交日（住宅成交日期 meta.latestDeal 是中古屋，兩者不同）
const presaleMax = Object.values(dealsRaw as Record<string, { d: string }[]>).flat().reduce((m, x) => (x.d > m ? x.d : m), '');
export const asOf: string = fromPipeline ? presaleMax || B.meta.latestDeal : P.asOf;
export const note: string = B && B.projects ? `建案名稱、起造人、戶數、建照與銷售期間來自內政部預售屋建案備查資料；成交統計與每戶明細依內政部預售屋實價登錄原始資料計算（已扣車位、排除特殊交易），最新簽約 ${presaleMax || B.meta.latestDeal}。` : P.note;
export const allNote: string = fromPipeline ? '依內政部預售屋實價登錄原始資料計算（新竹市 O、新竹縣 J），列出還在預售或尚未交屋的建案（近兩年有成交，或近四年內開始銷售），並收錄 2019 年起每一筆揭露的成交；同一建案的不同寫法（例如豐采520／豐采）已合併。' : P.allNote;
// 內政部資料中無法編碼的字以「?」表示，對應到常用名稱
export const ALIAS: Record<string, string> = { '森?': '森藴' };
const canon = (n: string) => ALIAS[n] ?? n;
const pipeRows: any[] = B && B.projects ? B.projects.map((p: any) => ({ ...p, name: canon(p.name), rawName: p.name })) : [];
export const featured: Project[] = (P.featured as Project[]).map((f) => {
  const q = pipeRows.find((x) => x.name === f.name && x.r === f.r);
  if (!q) return f;
  const lj = lejuFor(f.r, f.dist || q.dist, f.name), win = useLeju(lj, q.n);
  return { ...f, lj, moiN: q.n, src: win ? 'leju' : 'moi', alias: q.alias, first: q.first, med: q.med ?? f.med, min: q.min ?? f.min, max: q.max ?? f.max, medTotal: q.medTotal ?? f.medTotal, n: q.n, latest: q.latest,
    status: q.latest >= '2026' ? '2026 仍有成交' : (f.status === '已標示完售' ? f.status : '近期無新成交'),
    dev: q.dev ?? f.dev, units: q.units ?? f.units, addr: q.addr || f.addr, sales: q.sales || f.sales, permit: q.permit || f.permit,
    sources: [['內政部實價登錄', 'https://lvr.land.moi.gov.tw/'], ...(lj ? [['樂居建案頁', lj.url]] : []), ...f.sources] as [string, string][] };
}).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
export const all: Row[] = ((fromPipeline ? pipeRows : P.all) as Row[]).map((p: any) => {
  const lj = lejuFor(p.r, p.dist, p.name);
  return lj ? { ...p, lj, moiN: p.n, src: useLeju(lj, p.n) ? 'leju' : 'moi' } : p;
});
export const rName = (r: string) => (r === 'city' ? '新竹市' : '新竹縣');
export const statusClass = (s: string) => (s.startsWith('2026') ? 'tag' : 'tag g');
export const developers = (() => {
  const m = new Map<string, Project[]>();
  for (const p of featured) if (p.dev) for (const d of p.dev.split('、')) m.set(d, [...(m.get(d) || []), p]);
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
})();
export const featuredByDist = (name: string) => featured.filter((p) => p.dist === name);
export const allByDist = (name: string) => all.filter((p) => p.dist === name).sort((a, b) => b.n - a.n);
export const districtIdOf = (name: string) => districts.find((d) => d.name === name)?.id;
export const f1 = (v?: number | null) => (v == null ? '—' : v.toFixed(1));

export interface Deal {
  d: string; unit: string; floor: string; fn: number | null; tf: number | null; rooms: string;
  area: number; main: number | null; parea: number; net: number; ptype: string; pcount: number; pprice: number | null;
  parks: [string, number, number, string][]; total: number; house: number; up: number | null; note: string; cancel: string;
}
const DEALS = dealsRaw as Record<string, Deal[]>;
export const hasRealDeals = Object.keys(DEALS).length > 0;
export const dealsFor = (name: string, r?: string, dist?: string): Deal[] => {
  if (r && dist && DEALS[`${r}|${dist}|${name}`]) return DEALS[`${r}|${dist}|${name}`];
  const k = Object.keys(DEALS).find((x) => canon(x.split('|')[2]) === name && (!r || x.startsWith(r + '|')));
  return k ? DEALS[k] : [];
};
// 版面示範用模擬資料：僅在尚未接上真實資料時顯示
export const sample = (() => {
  const k = Object.keys(sampleRaw)[0];
  return { name: k.split('|')[2], dist: k.split('|')[1], deals: (sampleRaw as Record<string, Deal[]>)[k] };
})();
export const pidOf = (s: string) => 'p' + createHash('md5').update(s).digest('hex').slice(0, 8);
// 資料管線產出、但不在精選名單內的建案，也產生獨立頁
export const pipelineOnly = fromPipeline
  ? (all as Row[]).filter((p) => !featured.some((f) => f.name === p.name)).map((p) => ({ ...p, id: pidOf(`${p.r}|${p.dist}|${p.name}`) }))
  : [];
export const pageIdOf = (name: string, r?: string, dist?: string) =>
  featured.find((f) => f.name === name)?.id ?? pipelineOnly.find((p) => p.name === name && (!r || p.r === r) && (!dist || p.dist === dist))?.id;

const med = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function analyze(deals: Deal[]) {
  const live = deals.filter((d) => !d.cancel);
  const ups = live.map((d) => d.up).filter((x): x is number => x != null);
  const parks = live.flatMap((d) => d.parks.length ? d.parks.map((p) => ({ type: p[0] || d.ptype, price: p[1], area: p[2], fl: p[3] }))
    : (d.ptype && d.pprice ? Array.from({ length: d.pcount || 1 }, () => ({ type: d.ptype, price: d.pprice! / (d.pcount || 1), area: d.parea / (d.pcount || 1), fl: '' })) : []));
  const ptypes = [...new Set(parks.map((p) => p.type))].map((t) => {
    const xs = parks.filter((p) => p.type === t && p.price > 0);
    const pr = xs.map((p) => p.price);
    return { type: t, n: xs.length, med: med(pr), min: pr.length ? Math.min(...pr) : null, max: pr.length ? Math.max(...pr) : null, area: med(xs.map((p) => p.area)) };
  }).sort((a, b) => b.n - a.n);
  const unsplit = live.filter((d) => d.ptype && !d.pprice).length;
  const floors = [...new Set(live.map((d) => d.fn).filter((x): x is number => x != null))].sort((a, b) => b - a).map((f) => {
    const xs = live.filter((d) => d.fn === f); const u = xs.map((d) => d.up).filter((x): x is number => x != null);
    return { f, n: xs.length, med: med(u), min: u.length ? Math.min(...u) : null, max: u.length ? Math.max(...u) : null };
  });
  const rooms = [...new Set(live.map((d) => d.rooms.split('房')[0] + '房'))].sort().map((r) => {
    const xs = live.filter((d) => d.rooms.startsWith(r));
    return { r, n: xs.length, net: med(xs.map((d) => d.net)), total: med(xs.map((d) => d.total)), house: med(xs.map((d) => d.house)), up: med(xs.map((d) => d.up).filter((x): x is number => x != null)) };
  });
  // 銷控表：棟別 × 樓層（樓層取自「移轉層次」，棟別取自「棟及號」）
  const bOf = (u: string) => u.match(/^([A-Za-z0-9]+?)(?:棟|-)/)?.[1] ?? (u.match(/^([A-Za-z])/)?.[1] ?? '—');
  const cells = live.filter((d) => d.fn != null).map((d) => ({ b: bOf(d.unit), f: d.fn!, d }));
  const cols = [...new Set(cells.map((c) => c.b))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const grid = { cols, rows: [...new Set(cells.map((c) => c.f))].sort((a, b) => b - a).map((f) => ({ f, cells: cols.map((b) => {
    const xs = cells.filter((c) => c.f === f && c.b === b).map((c) => c.d);
    return xs.length ? { n: xs.length, up: med(xs.map((x) => x.up).filter((x): x is number => x != null)), units: xs.map((x) => x.unit).join('、') } : null;
  }) })) };
  return { n: deals.length, live: live.length, cancel: deals.length - live.length, upMed: med(ups), upMin: ups.length ? Math.min(...ups) : null, upMax: ups.length ? Math.max(...ups) : null,
    netMed: med(live.map((d) => d.net)), totalMed: med(live.map((d) => d.total)), parkN: parks.length, ptypes, unsplit, floors, rooms, grid, latest: deals[0]?.d };
}

// 預售屋成交總金額（依簽約月份／季度加總，新竹市 vs 新竹縣）
// 排除：解約、單筆 500 坪以上（整棟、廠辦等大宗交易，會讓單月暴衝）
// 起點：資料最早月份 +2 個月（最前面兩個月只收到部分批次，不完整）
// 最新簽約月份與其所在季度：仍在 30 天申報期內，標示「未完整」
export interface VolBar { k: string; label: string; city: number; county: number; cityN: number; countyN: number; partial: boolean }
export const BULK_AREA = 500;
export const volume = (() => {
  // 資料管線輸出的每月合計（含已完銷建案；排除解約與單筆 500 坪以上大宗交易）
  const PM: { bulkExcluded: number; months: Record<string, { city?: [number, number]; county?: [number, number] }> } | undefined = B.presaleMonthly;
  const excluded = PM?.bulkExcluded ?? 0;
  if (!PM || !presaleMax) return { months: [] as VolBar[], quarters: [] as VolBar[], excluded, start: '' };
  const addM = (ym: string, n: number) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`; };
  const start = '2023-01', last = presaleMax.slice(0, 7);
  const months: VolBar[] = [];
  for (let m = start; m <= last; m = addM(m, 1)) {
    const o = PM.months[m] || {};
    months.push({ k: m, label: `${+m.slice(5)}月`, city: o.city?.[0] ?? 0, county: o.county?.[0] ?? 0, cityN: o.city?.[1] ?? 0, countyN: o.county?.[1] ?? 0, partial: m === last });
  }
  const qOf = (m: string) => `${m.slice(0, 4)}Q${Math.ceil(+m.slice(5) / 3)}`;
  const qm = new Map<string, VolBar & { cnt: number }>();
  for (const b of months) {
    const q = qOf(b.k);
    const o = qm.get(q) || { k: q, label: `${q.slice(2, 4)}Q${q.slice(5)}`, city: 0, county: 0, cityN: 0, countyN: 0, partial: false, cnt: 0 };
    o.city += b.city; o.county += b.county; o.cityN += b.cityN; o.countyN += b.countyN; o.cnt++; o.partial ||= b.partial;
    qm.set(q, o);
  }
  const quarters = [...qm.values()].filter((q) => q.cnt === 3 || q.partial).map(({ cnt, ...q }) => ({ ...q, partial: q.partial || cnt < 3 }));
  return { months, quarters, excluded, start };
})();
