// 租金行情：scripts/build_rent.py 產出的 src/data/rent.json
import R from '../data/rent.json';
import { regions, districts, type District, type RegionKey } from './data';

export interface RentStat {
  aptN: number; apt: number | null; perPing: number | null;
  rooms: Record<'1' | '2' | '3' | '4+', { n: number; rent: number | null }>;
  suiteN: number; suite: number | null; houseN: number; house: number | null; skewed?: boolean;
}
export const rentMeta: { seasons: string[]; latest: string; earliest?: string; note: string } = R.meta;
export const rentRegion = (k: RegionKey) => (R.regions as Record<string, RentStat>)[k];
export const rentDistrict = (id: string): RentStat | undefined => (R.districts as Record<string, RentStat>)[id];
export const usable = (s?: RentStat) => !!s && !s.skewed && s.aptN >= 5 && s.perPing != null;

// 毛租金報酬率：每坪月租 × 12 ÷ 每坪中古屋單價
export const grossYield = (perPing: number | null, usedWan: number | null | undefined) =>
  perPing && usedWan ? (perPing * 12) / (usedWan * 10000) * 100 : null;

export const yieldRows = () => {
  const rows: { name: string; href: string; n: number; perPing: number | null; three: number | null; used: number | null; y: number | null; tier: string }[] = [];
  for (const k of ['city', 'county'] as RegionKey[]) {
    const s = rentRegion(k);
    rows.push({ name: regions[k].name + '（全區）', href: `/region/${regions[k].slug}/`, n: s.aptN, perPing: s.perPing, three: s.rooms['3'].rent, used: regions[k].used, y: grossYield(s.perPing, regions[k].used), tier: 'main' });
  }
  districts.filter((d: District) => d.r === 'city').concat(districts.filter((d: District) => d.r === 'county')).forEach((d) => {
    const s = rentDistrict(d.id);
    if (!usable(s)) return;
    rows.push({ name: d.name, href: `/region/${regions[d.r].slug}/${d.id}/`, n: s!.aptN, perPing: s!.perPing, three: s!.rooms['3'].rent, used: d.used ?? null, y: grossYield(s!.perPing, d.used), tier: s!.aptN >= 20 ? 'main' : 'ref' });
  });
  return rows;
};
export const wan = (x: number | null | undefined) => (x == null ? '—' : (x / 10000).toFixed(x >= 100000 ? 0 : 1) + ' 萬');
export const seasonLabel = (s: string) => `${Number(s.slice(0, 3)) + 1911} 年第 ${s.slice(-1)} 季`;
