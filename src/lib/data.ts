// 合併「首版數據 seed.json」與「資料管線輸出 build.json」
import seed from '../data/seed.json';
import build from '../data/build.json';

export type RegionKey = 'city' | 'county';
export type AgeBands = Record<'0-10' | '11-20' | '21-30' | '31+', { n: number; med: number | null }>;
export const AGE_LABEL: [keyof AgeBands, string][] = [['0-10', '10 年內'], ['11-20', '11～20 年'], ['21-30', '21～30 年'], ['31+', '30 年以上']];
export interface Region {
  ages?: AgeBands;
  name: string; slug: string; used: number; usedN: number; presale: number; presaleN: number;
  trend: [string, number, number][]; trendNote: string;
}
export interface District {
  id: string; r: RegionKey; name: string; tier: string; intro: string; points: string[];
  used?: number; n?: number; presale?: number; pn?: number; avg5m?: number; yoy?: number;
  bld2025?: number; land2025?: number; share?: number; ages?: AgeBands;
}

const D: any = structuredClone(seed);
const B: any = build;
if (B) {
  Object.assign(D.meta, B.meta);
  for (const k of Object.keys(B.regions)) {
    Object.assign(D.regions[k], B.regions[k]);
    D.regions[k].trendNote = '未完成季度不計算中位數；完整季度少於 5 筆不顯示。';
  }
  for (const d of D.districts) {
    const b = B.districts[d.id];
    if (!b) continue;
    if (d.r === 'city' && !b.n) continue; // 新竹市實價登錄未分區，保留首版分區資訊
    if (d.r === 'city' && b.tier !== 'low') b.tier = 'main';
    Object.assign(d, b);
    if (b.used == null) delete d.used;
    if (b.presale == null) delete d.presale;
    delete d.avg5m; delete d.yoy;
  }
}

export const meta: { synced: string; latestDeal: string; note: string } = D.meta;

// 內政部每月 1、11、21 日公布一批；回推同步當天以前最近一次的公布日
export function latestRelease(synced = meta.synced) {
  const d = new Date(synced + 'T00:00:00Z');
  for (let i = 0; i < 12; i++) {
    if ([1, 11, 21].includes(d.getUTCDate())) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return synced;
}
export function nextRelease(synced = meta.synced) {
  const d = new Date(synced + 'T00:00:00Z');
  for (let i = 0; i < 12; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if ([1, 11, 21].includes(d.getUTCDate())) return d.toISOString().slice(0, 10);
  }
  return '';
}
export const md = (iso: string) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '');
export const LAG_NOTE = '依法成交（預售屋為簽約）後 30 天內申報，內政部每 10 天公布一批，所以公布的成交日期通常比今天晚 3～6 週。';
export const regions: Record<RegionKey, Region> = D.regions;
export const districts: District[] = D.districts;
export const presaleNews: { t: string; v: string; d: string }[] = D.presaleNews;
export const fromPipeline = !!B;

export const dist = (id: string) => districts.find((d) => d.id === id)!;
export const regionOf = (d: District) => regions[d.r];
export const regionBySlug = (slug: string) =>
  (Object.keys(regions) as RegionKey[]).find((k) => regions[k].slug === slug)!;
export const districtUrl = (d: District) => `/region/${regions[d.r].slug}/${d.id}/`;
export const regionUrl = (k: RegionKey) => `/region/${regions[k].slug}/`;
export const pct = (a: number, b: number) => ((a / b - 1) * 100);
export const fmt = (n?: number | null, d = 0) =>
  n == null || isNaN(n) ? '—' : Number(n).toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d });

// 14 個生活圈的中古屋每坪中位數（依門牌路名歸類，近半年；少於 10 筆為 null）
export const zoneStats: Record<string, { used: number | null; n: number; ages?: AgeBands }> = (build as any).zones ?? {};
export const schoolStats: Record<string, any> = (build as any).schools ?? {};
