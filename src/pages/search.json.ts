// 站內搜尋索引：區域、預售建案、文章、新聞、工具、頁面。site.js 第一次打開搜尋時才載入。
import { getCollection } from 'astro:content';
import { regions, districts, districtUrl, regionUrl } from '../lib/data';
import { featured, pipelineOnly, f1 } from '../lib/presale';
import { news } from '../lib/news';
import { TOOLS } from '../lib/tools';

export async function GET() {
  const items: { t: string; u: string; k: string; s: string; w?: string }[] = [];
  for (const k of ['city', 'county'] as const) items.push({ t: regions[k].name, u: regionUrl(k), k: '區域', s: `中古屋 ${regions[k].used} 萬/坪` });
  for (const d of districts) {
    items.push({ t: d.name, u: districtUrl(d), k: '區域', s: d.used != null ? `中古屋 ${d.used} 萬/坪` : '房價與建案' });
  }
  for (const p of featured) items.push({ t: p.name, u: `/presale/${p.id}/`, k: '建案', s: `${p.dist || '新竹市'}・${f1(p.med)} 萬/坪`, w: p.dev || '' });
  for (const p of pipelineOnly) items.push({ t: p.name, u: `/presale/${p.id}/`, k: '建案', s: `${p.dist || '新竹市'}・${f1(p.med)} 萬/坪`, w: p.dev || '' });
  const posts = (await getCollection('guide')).sort((a, b) => a.data.order - b.data.order);
  for (const p of posts) items.push({ t: p.data.title, u: `/guide/${p.id}/`, k: '文章', s: p.data.category, w: p.data.description + ' ' + p.data.tags.join(' ') });
  const weekly = (await getCollection('weekly')).sort((a, b) => b.id.localeCompare(a.id));
  for (const w of weekly) items.push({ t: w.data.title, u: `/weekly/${w.id}/`, k: '新聞', s: w.data.period, w: '週報 房市週報 ' + w.data.description });
  for (const n of news) items.push({ t: n.title, u: `/news/${n.id}/`, k: '新聞', s: n.date.replace(/-/g, '/'), w: n.cat });
  for (const t of TOOLS) items.push({ t: t.t, u: `/tools/${t.slug}/`, k: '試算', s: t.d });
  const pages: [string, string, string][] = [
    ['租金行情', '/rent/', '各區月租與租金報酬率'], ['房市週報', '/weekly/', '每週實價登錄與新聞整理'], ['預售建案總覽', '/presale/', '新竹縣市所有預售建案'],
    ['建商列表', '/developer/', '依起造人看建案'], ['央行與貸款政策', '/policy/', '理監事會、信用管制、青安'],
    ['更新日曆', '/calendar/', '實價登錄與政策發布日期'], ['生活圈', '/areas/', '竹科、高鐵、舊城生活圈'],
    ['交流平台', '/community/', '問站長、討論區'], ['創辦人', '/about/', 'Simon 哥'], ['資料來源', '/sources/', '資料怎麼算'],
  ];
  for (const [t, u, s] of pages) items.push({ t, u, k: '頁面', s });
  // 生活圈與常用地名（搜尋「關埔」「巨城」也找得到）
  const zones: [string, string, string, string][] = [
    ['竹科・東區生活圈', '/areas/#tech', '東區、關埔、寶山', '關埔 關埔重劃區 竹科 園區 光復路 清大 交大 陽明交大'],
    ['竹北・高鐵生活圈', '/areas/#zhubei-hsr', '高鐵特區、縣治、台元', '高鐵特區 縣治 縣三 台元 遠百 竹北'],
    ['竹東・台 68 生活圈', '/areas/#zhudong', '竹東、芎林、橫山', '二重埔 台68 竹東'],
    ['湖口・新豐工業生活圈', '/areas/#hukou-xinfeng', '湖口、新豐', '新竹工業區 湖口 新豐 鳳山崎'],
    ['新竹舊城・北區生活圈', '/areas/#old-city', '城隍廟、火車站、西大路', '舊城 火車站 城隍廟 巨城 北區 東區前站'],
    ['香山・南竹生活圈', '/areas/#xiangshan', '公道三路、香山', '香山 公道三路 南寮'],
  ];
  for (const [t, u, s, w] of zones) items.push({ t, u, k: '生活圈', s, w });
  items.push({ t: '巨城購物中心周邊（東區）', u: districtUrl(districts.find((d) => d.id === 'east')!), k: '生活圈', s: '新竹市東區', w: '巨城 Big City 中央路 民權路' });
  const more: [string, string, string][] = [['重大建設追蹤', '/construction/', '輕軌、大車站、AI 園區進度'], ['Simon 哥觀點', '/viewpoint/', '選屋原則與建案拆解'],
    ['關於 SimonHC', '/about-simonhc/', '網站使命與編輯方式'], ['內容編輯政策', '/editorial/', 'AI 使用與署名規則'], ['資料錯誤回報', '/report/', '回報資料錯誤'],
    ['交易量', '/volume/', '建物買賣移轉棟數'], ['租金行情', '/rent/', '月租與逐年變化']];
  for (const [t, u, s] of more) items.push({ t, u, k: '頁面', s });
  return new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json' } });
}
