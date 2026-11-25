import P from '../data/presale_projects.json';
import build from '../data/build.json';
import { districts } from './data';
import dealsRaw from '../data/presale_deals.json';
import sampleRaw from '../data/presale_sample.json';
import { createHash } from 'node:crypto';

export interface Project {
  id: string; name: string; r: 'city' | 'county'; dist: string; dev: string; addr: string; units: number; permit: string; sales: string;
  med: number | null; min: number | null; max: number | null; medTotal: number | null; rooms: string; n: number; latest: string;
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
export const allNote: string = fromPipeline ? '依內政部預售屋實價登錄原始資料計算（新竹市 O、新竹縣 J），近兩年有揭露成交的建案全部列出。' : P.allNote;
// 內政部資料中無法編碼的字以「?」表示，對應到常用名稱
export const ALIAS: Record<string, string> = { '森?': '森藴' };
const canon = (n: string) => ALIAS[n] ?? n;
const pipeRows: any[] = B && B.projects ? B.projects.map((p: any) => ({ ...p, name: canon(p.name), rawName: p.name })) : [];
export const featured: Project[] = (P.featured as Project[]).map((f) => {
  const q = pipeRows.find((x) => x.name === f.name && x.r === f.r);
  if (!q) return f;
  return { ...f, med: q.med ?? f.med, min: q.min ?? f.min, max: q.max ?? f.max, medTotal: q.medTotal ?? f.medTotal, n: q.n, latest: q.latest,
    status: q.latest >= '2026' ? '2026 仍有成交' : (f.status === '已標示完售' ? f.status : '近期無新成交'),
    dev: q.dev ?? f.dev, units: q.units ?? f.units, addr: q.addr || f.addr, sales: q.sales || f.sales, permit: q.permit || f.permit,
    sources: [['內政部實價登錄', 'https://lvr.land.moi.gov.tw/'], ...f.sources] as [string, string][] };
}).sort((a, b) => (b.latest || '').localeCompare(a.latest || ''));
export const all: Row[] = (fromPipeline ? pipeRows : P.all) as Row[];
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
