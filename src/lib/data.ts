// 合併「首版數據 seed.json」與「資料管線輸出 build.json」
import seed from '../data/seed.json';
import build from '../data/build.json';

export type RegionKey = 'city' | 'county';
export interface Region {
  name: string; slug: string; used: number; usedN: number; presale: number; presaleN: number;
  trend: [string, number, number][]; trendNote: string;
}
export interface District {
  id: string; r: RegionKey; name: string; tier: string; intro: string; points: string[];
  used?: number; n?: number; presale?: number; pn?: number; avg5m?: number; yoy?: number;
  bld2025?: number; land2025?: number; share?: number;
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
