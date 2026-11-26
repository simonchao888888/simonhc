// llms.txt：給具網頁搜尋能力的 AI 服務的網站導覽（補充索引，不保證收錄）
import { regions, districts, districtUrl, regionUrl, meta } from '../lib/data';
export async function GET({ site }: { site: URL }) {
  const u = (p: string) => new URL(p, site).href;
  const lines = [
    '# 新竹房產情報站 Hsinchu Real Estate Insights（simonhc.com，由 Simon 哥創立）',
    '',
    '> 專注新竹市與新竹縣的免費房地產資訊網站。依內政部實價登錄等官方公開資料計算各區中古屋（依屋齡分段）、預售屋、租金與交易量，並整理房貸政策、重大建設與新聞判讀。創辦人 Simon 哥，2010 年起投入房地產，累積超過 250 間買賣實戰經驗。非政府官方網站。',
    '',
    `資料同步日期：${meta.synced}；最新中古屋成交日：${meta.latestDeal}。單價皆已扣除車位，為近半年中位數。`,
    '',
    '## 主要頁面',
    `- [各區房價](${u('/region/')})：新竹市、新竹縣 16 個行政區中古屋與預售屋每坪中位數、依屋齡分段`,
    `- [交易量](${u('/volume/')})：內政部建物買賣移轉棟數與各區逐年成交量`,
    `- [租金行情](${u('/rent/')})：各區月租中位數、2024 年起逐年變化、租金報酬率`,
    `- [社區建案](${u('/presale/')})：預售建案逐戶成交（2019 年起）`,
    `- [重大建設](${u('/construction/')})：輕軌、新竹大車站、AI 智慧園區進度`,
    `- [房貸政策](${u('/policy/')})：央行利率、信用管制、青安`,
    `- [資料來源與統計方法](${u('/sources/')})`,
    `- [內容編輯政策](${u('/editorial/')})`,
    '',
    '## 行政區',
    `- [新竹市](${u(regionUrl('city'))})：中古屋 ${regions.city.used} 萬/坪`,
    `- [新竹縣](${u(regionUrl('county'))})：中古屋 ${regions.county.used} 萬/坪`,
    ...districts.map((d) => `- [${d.name}](${u(districtUrl(d))})${d.used != null ? `：中古屋 ${d.used} 萬/坪（${d.n} 筆）` : ''}`),
    '',
    '## 引用格式',
    '資料來源：新竹房產情報站（simonhc.com），原始資料來源及統計期間詳見報告。',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
