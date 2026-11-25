// 試算工具定義：欄位 + 計算（在瀏覽器端執行）
export interface Field { l: string; n: string; v: number | string; opts?: [string, string][] }
export interface Tool { slug: string; t: string; d: string; f: Field[]; calc: (v: Record<string, number>) => string }

const fmt = (n: number, d = 0) => (isNaN(n) ? '—' : n.toLocaleString('zh-TW', { maximumFractionDigits: d, minimumFractionDigits: d }));
const wan = (n: number) => fmt(n, 0) + ' 萬';
export const pmt = (P: number, rate: number, n: number) => { const r = rate / 12 / 100; return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n)); };

export const TOOLS: Tool[] = [
  {
    slug: 'affordability', t: '收入負擔能力試算', d: '輸入家庭月收入，看看在新竹各區大概買得起什麼。',
    f: [
      { l: '家庭月收入（萬元，建議只計固定月薪）', n: 'inc', v: 15 }, { l: '可接受房貸占收入比例（%）', n: 'ratio', v: 33 },
      { l: '房貸利率（%）', n: 'rate', v: 2.3 }, { l: '貸款年限（年）', n: 'yrs', v: 30 }, { l: '貸款成數（%）', n: 'ltv', v: 80 },
      { l: '目前可動用自備款（萬元）', n: 'cash', v: 300 }, { l: '想買的區域行情', n: 'ppp', v: 'AREA' },
    ],
    calc: (v) => {
      const m = (v.inc * v.ratio) / 100, r = v.rate / 12 / 100, n = v.yrs * 12;
      const loan = r ? (m * (1 - Math.pow(1 + r, -n))) / r : m * n;
      const price = loan / (v.ltv / 100), down = price - loan, gap = down - v.cash, ping = price / v.ppp;
      return `<div class="note">每月可負擔房貸</div><div class="big">${fmt(m, 1)} 萬</div>
      <div class="kv"><span>可貸金額上限</span><b>${wan(loan)}</b></div><div class="kv"><span>總價上限</span><b>${wan(price)}</b></div>
      <div class="kv"><span>需要頭期款</span><b>${wan(down)}</b></div>
      <div class="kv"><span>自備款${gap > 0 ? '缺口' : '剩餘'}</span><b class="${gap > 0 ? 'up' : 'down'}">${wan(Math.abs(gap))}</b></div>
      <div class="kv"><span>在所選區域約可買</span><b>${fmt(ping, 1)} 坪（不含車位）</b></div>
      <div style="margin:14px 0 4px;display:grid;grid-template-columns:repeat(10,14px);gap:3px" aria-hidden="true">${Array.from({ length: Math.max(0, Math.min(80, Math.round(ping))) }, () => '<i style="display:block;width:14px;height:14px;background:#9FD3B7;opacity:.85"></i>').join('')}</div>
      <div class="note">每一格約一坪，大概是一張雙人床再多一點的大小。</div>
      <p class="note">頭期款之外還需準備約總價 3～5% 的稅費雜支與裝潢預算。</p>`;
    },
  },
  {
    slug: 'total-cost', t: '買房總費用試算', d: '頭期款只是開始。把稅費、代書、仲介、裝潢搬家與生活預備金一起算進來。',
    f: [
      { l: '房屋總價（萬元）', n: 'price', v: 1500 }, { l: '貸款成數（%）', n: 'ltv', v: 80 },
      { l: '房屋評定現值（萬元，契稅基礎，約總價 1～2 成）', n: 'assess', v: 200 },
      { l: '是否透過仲介', n: 'agent', v: '1', opts: [['1', '是（買方服務費 2%）'], ['0', '否']] },
      { l: '裝潢與家具（萬元）', n: 'deco', v: 150 }, { l: '搬家與雜支（萬元）', n: 'move', v: 5 },
      { l: '生活預備金（月數）', n: 'months', v: 6 }, { l: '每月生活支出（萬元）', n: 'living', v: 5 },
    ],
    calc: (v) => {
      const down = v.price * (1 - v.ltv / 100), deed = v.assess * 0.06, stamp = v.assess * 0.001, scr = 1.8;
      const bank = 0.5 + v.price * (v.ltv / 100) * 0.001, ag = v.agent ? v.price * 0.02 : 0, res = v.months * v.living;
      const tot = down + deed + stamp + scr + bank + ag + v.deco + v.move + res;
      return `<div class="note">交屋前後需準備現金</div><div class="big">${wan(tot)}</div>
      <div class="kv"><span>頭期款</span><b>${wan(down)}</b></div><div class="kv"><span>契稅（評定現值 6%）</span><b>${fmt(deed, 1)} 萬</b></div>
      <div class="kv"><span>印花稅（0.1%）</span><b>${fmt(stamp, 2)} 萬</b></div><div class="kv"><span>代書費與規費（估）</span><b>${fmt(scr, 1)} 萬</b></div>
      <div class="kv"><span>銀行開辦與設定（估）</span><b>${fmt(bank, 1)} 萬</b></div><div class="kv"><span>仲介服務費</span><b>${fmt(ag, 1)} 萬</b></div>
      <div class="kv"><span>裝潢家具＋搬家</span><b>${wan(v.deco + v.move)}</b></div><div class="kv"><span>生活預備金</span><b>${wan(res)}</b></div>`;
    },
  },
  {
    slug: 'mortgage-payment', t: '房貸月付金試算', d: '比較寬限期內（只繳息）與寬限期後（本息平均攤還）的月付金。',
    f: [{ l: '貸款金額（萬元）', n: 'loan', v: 1200 }, { l: '年利率（%）', n: 'rate', v: 2.3 }, { l: '貸款年限（年）', n: 'yrs', v: 30 }, { l: '寬限期（年）', n: 'grace', v: 3 }],
    calc: (v) => {
      const P = v.loan * 1e4, n = v.yrs * 12, g = Math.max(0, Math.min(v.grace, v.yrs - 1)) * 12;
      const io = (P * v.rate) / 100 / 12, after = pmt(P, v.rate, n - g), nog = pmt(P, v.rate, n);
      const totG = io * g + after * (n - g), totN = nog * n;
      return `<div class="note">寬限期內每月（只繳息）</div><div class="big">${fmt(io)} 元</div>
      <div class="kv"><span>寬限期後每月</span><b class="up">${fmt(after)} 元</b></div><div class="kv"><span>月付金跳升</span><b>+${fmt(after - io)} 元</b></div>
      <div class="kv"><span>不使用寬限期每月</span><b>${fmt(nog)} 元</b></div>
      <div class="kv"><span>總利息（有寬限期）</span><b>${wan((totG - P) / 1e4)}</b></div><div class="kv"><span>總利息（無寬限期）</span><b>${wan((totN - P) / 1e4)}</b></div>
      <p class="note">寬限期讓前幾年壓力變小，但總利息更高、之後月付金跳升；請以寬限期後的金額評估負擔。</p>`;
    },
  },
  {
    slug: 'rent-vs-buy', t: '買房或租房比較', d: '在預計居住年限內，比較買房與租房的累計現金支出（不含房價漲跌預測）。',
    f: [
      { l: '房屋總價（萬元）', n: 'price', v: 1500 }, { l: '貸款成數（%）', n: 'ltv', v: 80 }, { l: '房貸利率（%）', n: 'rate', v: 2.3 },
      { l: '貸款年限（年）', n: 'yrs', v: 30 }, { l: '每年持有成本：房屋稅、地價稅、管理費、修繕（萬元）', n: 'hold', v: 6 },
      { l: '同等房子月租金（萬元）', n: 'rent', v: 2.6 }, { l: '租金年漲幅（%）', n: 'rg', v: 1.5 }, { l: '預計居住年限（年）', n: 'stay', v: 8 },
    ],
    calc: (v) => {
      const loan = v.price * (v.ltv / 100) * 1e4, r = v.rate / 12 / 100, n = v.yrs * 12, m = pmt(loan, v.rate, n);
      let bal = loan, paid = 0;
      for (let i = 0; i < Math.min(v.stay * 12, n); i++) { bal -= m - bal * r; paid += m; }
      const buyCash = v.price * (1 - v.ltv / 100) * 1e4 + paid + v.hold * 1e4 * v.stay, equity = v.price * 1e4 - bal;
      let rentT = 0; for (let y = 0; y < v.stay; y++) rentT += v.rent * 1e4 * 12 * Math.pow(1 + v.rg / 100, y);
      const buyNet = buyCash - equity;
      return `<div class="note">${v.stay} 年後的淨成本差異（假設房價持平）</div><div class="big">${buyNet < rentT ? '買房省 ' : '租房省 '}${wan(Math.abs(rentT - buyNet) / 1e4)}</div>
      <div class="kv"><span>買方累計現金支出</span><b>${wan(buyCash / 1e4)}</b></div><div class="kv"><span>屆時房屋淨值（總價－剩餘貸款）</span><b>${wan(equity / 1e4)}</b></div>
      <div class="kv"><span>買方淨成本</span><b>${wan(buyNet / 1e4)}</b></div><div class="kv"><span>租方累計租金</span><b>${wan(rentT / 1e4)}</b></div>
      <p class="note">未計入頭期款拿去投資的機會成本、交易稅費與房價漲跌；這些因素可能改變結論。</p>`;
    },
  },
];
