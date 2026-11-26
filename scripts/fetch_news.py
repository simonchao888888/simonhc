#!/usr/bin/env python3
"""
自動彙整新竹房市相關新聞標題（Google 新聞 RSS），輸出 src/data/news_feed.json。
只存標題、來源、日期與連結，不存內文；網站上顯示為「最新快訊」。

篩選規則（V5）：
  1. 優先：標題提到新竹縣市地名或竹科 → scope=hsinchu
  2. 其次：影響新竹買方的全國政策與房貸（央行、信用管制、青安、房貸利率、稅制…）→ scope=national
  3. 排除：海外房市與房貸新聞；只談其他縣市的建案、區域行情（標題沒有新竹）
  4. 同一事件多家媒體報導合併成一則，保留各家來源連結

每次執行另外寫一筆紀錄到 src/data/news_runs.json（最近 72 次），網站上公開顯示。
用法：python3 scripts/fetch_news.py [輸出檔]
"""
import json, os, re, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

QUERIES = [
    "新竹 房市", "竹北 房價", "新竹 實價登錄", "新竹 預售屋", "新竹縣 房價", "新竹市 房價",
    "竹科 房市", "竹東 房價", "關埔 房價", "新竹 建案", "湖口 新豐 房價",
    "央行 理監事會 房市", "央行 信用管制", "房貸利率 五大銀行", "房貸 銀行 首購",
    "青安3.0", "新青安", "囤房稅", "平均地權條例", "實價登錄 內政部",
]
OUT = sys.argv[1] if len(sys.argv) > 1 else "src/data/news_feed.json"
RUNS = os.path.join(os.path.dirname(OUT) or ".", "news_runs.json")
TW = timezone(timedelta(hours=8))

HC = re.compile(r"新竹|竹北|竹科|竹東|湖口|新豐|寶山|關埔|芎林|竹縣|竹市|頭前溪|台元|臺元|高鐵特區|縣治|巨城|竹苗|桃竹|二重埔|香山")
POLICY = re.compile(r"央行|理監事|信用管制|限貸|青安|新青安|房貸|首購|囤房稅|房屋稅|地價稅|平均地權|房地合一|實價登錄|內政部|金管會|升息|降息|利率|預售屋合約|銀行.*(放款|撥款)|社會住宅|包租代管|打炒房|建築貸款|撥款|申貸|核貸|貸款成數|購屋成本")
MARKET = re.compile(r"房市|房價|預售|中古屋|建商|成交量|買氣|購屋|房產|不動產|住宅")
OVERSEAS = re.compile(r"美國|美房|聯準會|Fed|韓國|日本|東京|中國|大陸|香港|加拿大|澳洲|英國|倫敦|新加坡|越南|泰國|杜拜|惠譽|穆迪|歐洲|德國")
OTHER_CITY = re.compile(r"台北|臺北|北市|新北|桃園|台中|臺中|台南|臺南|高雄|基隆|宜蘭|苗栗|彰化|雲林|嘉義|屏東|花蓮|台東|臺東|澎湖|金門|"
                        r"汐止|淡水|三重|板橋|林口|北士科|士林|內湖|南港|信義區|大安|沙鹿|清水|雙屯|大園|龍潭|中壢|青埔|萬大線|捷運[^\s]{0,4}線|"
                        r"六都|五都|雙北|北北基")


def fetch(q):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": f"{q} when:10d", "hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse(xml_bytes):
    out = []
    for it in ET.fromstring(xml_bytes).iter("item"):
        title = (it.findtext("title") or "").strip()
        src_el = it.find("source")
        source = src_el.text.strip() if src_el is not None and src_el.text else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(source) - 3]
        try:
            d = parsedate_to_datetime(it.findtext("pubDate")).astimezone(TW)
        except Exception:
            continue
        out.append({"title": title, "link": it.findtext("link") or "", "source": source, "dt": d})
    return out


def classify(title):
    """回傳 (scope, topic) 或 None（排除）"""
    hc = bool(HC.search(re.sub(r"不是.{0,4}新竹|雙北新竹以外", "", title)))
    if OVERSEAS.search(title) and not hc:
        return None
    if OTHER_CITY.search(title) and not hc:
        return None                                   # 只談其他縣市的建案或行情
    if hc and (MARKET.search(title) or POLICY.search(title) or re.search(r"建設|捷運|輕軌|園區|重劃|都更|商圈|房", title)):
        return "hsinchu", "新竹房市"
    if POLICY.search(title):
        topic = "央行" if re.search(r"央行|理監事|信用管制|限貸|升息|降息", title) else \
                "青安貸款" if "青安" in title else \
                "稅制與法規" if re.search(r"稅|平均地權|房地合一|實價登錄|內政部|合約", title) else "房貸利率"
        return "national", topic
    return None


def grams(t):
    t = re.sub(r"[\W_a-zA-Z0-9０-９]+", "", t)   # 只看中文字
    return {t[i:i + 2] for i in range(len(t) - 1)}


def same_event(a, b):
    if abs((a["dt"] - b["dt"]).total_seconds()) > 3 * 86400:
        return False
    ga, gb = a["g"], b["g"]
    if not ga or not gb:
        return False
    inter = len(ga & gb)
    c, j = inter / min(len(ga), len(gb)), inter / len(ga | gb)
    return c >= 0.5 or j >= 0.35 or (c >= 0.35 and inter >= 8)


def log_run(status, **kw):
    try:
        runs = json.load(open(RUNS, encoding="utf-8"))
    except Exception:
        runs = []
    runs.insert(0, {"at": datetime.now(TW).strftime("%Y-%m-%d %H:%M"), "status": status,
                    "run": os.environ.get("GITHUB_RUN_ID"), **kw})
    with open(RUNS, "w", encoding="utf-8") as f:
        json.dump(runs[:72], f, ensure_ascii=False, indent=1)


def main():
    raw, seen, errors = [], set(), 0
    for q in QUERIES:
        try:
            got = parse(fetch(q))
        except Exception as e:
            errors += 1
            print(f"! {q}: {e}", file=sys.stderr)
            continue
        for x in got:
            if x["link"] in seen:
                continue
            seen.add(x["link"])
            raw.append(x)
        time.sleep(0.5)
    if not raw:
        log_run("failed", fetched=0, errors=errors)
        sys.exit("沒有抓到任何新聞，保留舊檔。")

    for x in raw:
        x["cls"] = classify(x["title"])
        x["g"] = grams(x["title"])
    raw.sort(key=lambda x: x["dt"], reverse=True)

    # 同一事件合併（連鎖相似也算同一事件）：先比對全部報導，再看群組裡有沒有符合篩選規則的
    parent = list(range(len(raw)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(len(raw)):
        for j in range(i + 1, len(raw)):
            if same_event(raw[i], raw[j]):
                parent[find(i)] = find(j)
    groups = {}
    for i, x in enumerate(raw):
        groups.setdefault(find(i), []).append(x)

    items, dropped, merged = [], 0, 0
    for c in groups.values():
        ok = [y for y in c if y["cls"]]
        if not ok:
            dropped += len(c)
            continue
        merged += len(c) - 1
        hc = any(y["cls"][0] == "hsinchu" for y in ok)
        lead = max(ok, key=lambda y: (y["cls"][0] == "hsinchu", -len(y["title"])))   # 新竹相關、標題較精簡者當代表
        srcs, also = {lead["source"]}, []
        for y in sorted(c, key=lambda y: y["dt"], reverse=True):
            if y is lead or y["source"] in srcs:
                continue
            srcs.add(y["source"])
            also.append({"source": y["source"], "link": y["link"]})
        newest = max(y["dt"] for y in c)
        items.append({"title": lead["title"], "link": lead["link"], "source": lead["source"],
                      "date": newest.strftime("%Y-%m-%d"), "time": newest.strftime("%H:%M"), "ts": newest.timestamp(),
                      "topic": "新竹房市" if hc else lead["cls"][1], "scope": "hsinchu" if hc else "national",
                      "also": also[:6]})
    items.sort(key=lambda x: x["ts"], reverse=True)
    hc = [x for x in items if x["scope"] == "hsinchu"][:40]
    nat = [x for x in items if x["scope"] == "national"][:30]
    out_items = sorted(hc + nat, key=lambda x: x["ts"], reverse=True)
    for x in out_items:
        x.pop("ts")
    now = datetime.now(TW).strftime("%Y-%m-%d %H:%M")
    data = {"updated": now, "rules": "新竹相關優先；全國只收央行、房貸、青安、稅制等影響新竹買方的政策；排除海外與只談其他縣市的報導；同一事件合併",
            "items": out_items}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log_run("ok", fetched=len(raw), dropped=dropped, merged=merged, hsinchu=len(hc), national=len(nat), errors=errors)
    print(f"✓ 抓到 {len(raw)} 則、排除 {dropped} 則、合併 {merged} 則 → 新竹 {len(hc)}、全國政策 {len(nat)}（{OUT}）")


if __name__ == "__main__":
    main()
