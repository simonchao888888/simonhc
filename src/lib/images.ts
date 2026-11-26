// 圖片資料庫：所有照片的作者、授權、地點都集中在 src/data/images.json（由 scripts/fetch_images.py 產生）
// 頁面只用 id 取圖，不在各頁零散寫網址與授權。
import R from '../data/images.json';

export interface Img {
  id: string; title: string; place?: string | null; dist?: string | null; area?: string | null; cat: string;
  author: string; source: string; origin: string; license: string; licenseUrl: string; date: string | null;
  real: boolean; illustration: boolean; alt: string; w: number; h: number; ratio: number; pos: string;
  widths: number[]; path: string; avif: boolean;
}
export const images: Img[] = (R as { images: Img[] }).images;
export const imagesUpdated: string | null = (R as { updated?: string }).updated ?? null;
const byId = new Map(images.map((x) => [x.id, x]));
export const img = (id?: string | null) => (id ? byId.get(id) : undefined);

// 行政區專屬照片（每區一張；地點必須在該區內）
const DIST: Record<string, string> = {
  east: 'tra-hsinchu', north: 'city-god', xiangshan: 'xiangshan',
  zhubei: 'zhubei-tofu', zhudong: 'zhudong', hukou: 'hukou', xinfeng: 'xinfeng', xinpu: 'xinpu', guanxi: 'guanxi',
  qionglin: 'qionglin', hengshan: 'hengshan', baoshan: 'baoshan', beipu: 'beipu', emei: 'emei', jianshi: 'jianshi', wufeng: 'wufeng',
};
export const distImg = (id: string) => img(DIST[id]);

// 生活圈（V4 規格的 14 個）：照片、所屬行政區 id、代表交通、生活機能
export interface Zone { id: string; name: string; img: string; imgNote?: string; dist: string; transit: string; life: string; feature: string; href: string }
export const ZONES: Zone[] = [
  { id: 'guanpu', name: '關埔', img: 'guanxin-park', imgNote: '鄰近關埔的關新公園', dist: 'east', transit: '台 68 快速道路、園區二期聯外', life: '關埔國小、關新公園、園區生活廣場', feature: '緊鄰竹科的重劃區，新案集中、單價全市最高一區', href: '/areas/#tech' },
  { id: 'bigcity', name: '巨城', img: 'big-city', dist: 'east', transit: '中央路、公道五路、北新竹站', life: '巨城購物中心、新竹公園商圈', feature: '大型百貨帶動的成熟商圈，大樓與華廈並存', href: '/areas/#old-city' },
  { id: 'jinya', name: '金雅', img: '', dist: 'north', transit: '台 68 快速道路、公道五路、鐵道路', life: '載熙國小、舊社國小、湳雅商圈', feature: '北區的低密度重劃區，新案總價較關埔親民', href: '/areas/#old-city' },
  { id: 'nanliao', name: '南寮', img: 'fishing-port', dist: 'north', transit: '東大路、西濱公路', life: '新竹漁港、南寮旅遊服務中心、海岸自行車道', feature: '靠海的北區住宅區，透天與新大樓並存', href: '/areas/#old-city' },
  { id: 'oldcity', name: '新竹舊城', img: 'city-god', dist: 'north', transit: '臺鐵新竹站、公車總站', life: '城隍廟商圈、東門市場、護城河', feature: '機能最成熟的老城區，中古公寓與華廈多', href: '/areas/#old-city' },
  { id: 'guanghua', name: '光華', img: '', dist: 'north', transit: '光華街、經國路、北新竹站', life: '光華國中、傳統市場、經國路商圈', feature: '北區東側的成熟住宅區，以中古屋為主', href: '/areas/#old-city' },
  { id: 'univ', name: '清大交大', img: 'nthu-nctu', dist: 'east', transit: '光復路、大學路、國道 1 號新竹交流道', life: '清大、陽明交大、十八尖山', feature: '學區與園區之間，租屋需求穩定', href: '/areas/#tech' },
  { id: 'zbhsr', name: '竹北高鐵', img: 'thsr-hsinchu', dist: 'zhubei', transit: '高鐵新竹站、臺鐵六家站', life: '高鐵特區商圈、生醫園區、新竹縣第二運動場', feature: '新竹縣單價最高的重劃區，大樓新案集中', href: '/areas/#zhubei-hsr' },
  { id: 'zbgov', name: '竹北縣治', img: 'county-gov', dist: 'zhubei', transit: '光明六路、國道 1 號竹北交流道', life: '新竹縣政府、竹北遠百、文化公園', feature: '縣府周邊的成熟重劃區，機能與學區完整', href: '/areas/#zhubei-hsr' },
  { id: 'taiyuan', name: '台元', img: 'taiyuan', dist: 'zhubei', transit: '台 1 線、國道 1 號竹北交流道', life: '台元科技園區、竹北市區商圈', feature: '科技園區帶動的竹北東側住宅區', href: '/areas/#zhubei-hsr' },
  { id: 'erchongpu', name: '竹東二重埔', img: 'erchongpu', dist: 'zhudong', transit: '台 68 快速道路、臺鐵竹中站', life: '二重埔湧泉生態園區、竹東市區', feature: '竹科外溢的主要受益區，中古屋總價親民', href: '/areas/#zhudong' },
  { id: 'baoshan', name: '寶山', img: 'baoshan', dist: 'baoshan', transit: '國道 3 號寶山交流道、園區三期聯外', life: '寶山水庫、雙溪、竹科寶山用地', feature: '緊鄰竹科寶山擴建，產品以透天與新建案為主', href: '/areas/#tech' },
  { id: 'hukou', name: '湖口', img: 'hukou', dist: 'hukou', transit: '國道 1 號湖口交流道、臺鐵湖口站', life: '新竹工業區、湖口老街、王爺壟', feature: '工業區帶動的住宅區，基期較低', href: '/areas/#hukou-xinfeng' },
  { id: 'xinfeng', name: '新豐', img: 'xinfeng', dist: 'xinfeng', transit: '臺鐵新豐站、西濱公路', life: '新豐市區、紅毛港、明新科大', feature: '新竹縣北端的平價生活圈，通勤時間要實測', href: '/areas/#hukou-xinfeng' },
];

// 新聞自動配圖：依分類與標題關鍵字挑選；配不到就回傳 undefined，畫面改用分類色塊，不影響新聞更新
const KW: [RegExp, string][] = [
  [/竹北|高鐵/, 'zhubei-2023'], [/關埔|竹科|園區|台股|半導體/, 'science-park'], [/竹東|二重埔/, 'zhudong'],
  [/湖口|新豐/, 'hukou'], [/寶山/, 'baoshan'], [/香山/, 'xiangshan'], [/車站|大車站/, 'tra-hsinchu'],
  [/預售|新屋|建案/, 'site'], [/中古|老屋|公寓/, 'apartment'], [/縣/, 'county-gov'],
];
const CAT_IMG: Record<string, string> = { 央行政策: 'cbc', 房貸利率: 'cbc', 貸款政策: 'cbc', 青安貸款: 'cbc', 央行: 'cbc', 新竹市場: 'hero-hsinchu', 新竹房市: 'hero-hsinchu' };
export function newsImg(cat: string, title: string): Img | undefined {
  if (/央行|利率|房貸|青安|信用管制/.test(cat)) return img(CAT_IMG[cat]);
  for (const [re, id] of KW) if (re.test(title)) return img(id);
  return img(CAT_IMG[cat]);
}

// 分類識別色（對應 v4.css 的 --c-* 變數）
export const CAT_TONE: Record<string, string> = {
  新竹市場: 'news', 新竹房市: 'news', 央行政策: 'policy', 央行: 'policy', 房貸利率: 'policy', 貸款政策: 'policy', 青安貸款: 'policy',
  重大建設: 'build', 都市計畫: 'build', 科學園區: 'life',
};
