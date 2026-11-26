#!/usr/bin/env python3
"""
竹房知識站 — 新竹縣市實價登錄資料管線
--------------------------------------------------
從內政部「不動產成交案件實際資訊資料供應系統」下載季資料，
只取新竹市（O）與新竹縣（J），計算：
  * 縣市 / 行政區 近半年 中古屋、預售屋 每坪中位數與樣本數（已扣車位）
  * 縣市 近 8 季中古屋中位數趨勢
並輸出 src/data/build.json，網站建置時會自動覆蓋首版數據。

用法：
  python3 build_data.py                 # 自動抓最近 9 季
  python3 build_data.py --seasons 114S3 114S4 115S1 115S2 115S3
  python3 build_data.py --local ./zips  # 已手動下載的 lvr_landcsv.zip 放在資料夾

只需 Python 3.9+ 標準函式庫。
"""
import argparse, csv, io, json, os, re, statistics, sys, urllib.request, zipfile
from collections import defaultdict
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from city_district import city_district

URL = "https://plvr.land.moi.gov.tw/DownloadSeason?season={s}&type=zip&fileName=lvr_landcsv.zip"
# 每 10 天（1、11、21 日）揭露的批次，季檔還沒出來前靠這些補上最新成交
HIST_URL = "https://plvr.land.moi.gov.tw/DownloadHistory?type=history&fileName={d}"
CUR_URL = "https://plvr.land.moi.gov.tw/Download?{q}fileName={f}"
CUR_FILES = [f"{p}_lvr_land_{k}.csv" for p in "oj" for k in ("a", "b", "b_park", "c")] + ["o_lvr_buildcase.csv", "j_lvr_buildcase.csv"]
CITIES = {"o": "city", "j": "county"}           # 檔名前綴 → 站內 key
PING = 3.30579
# 「其他增建」是申報表的勾選項（竹北約 3 成成交都有勾），不代表特殊交易，所以不排除；「未登記建物」仍排除
EXCLUDE_NOTE = re.compile(r"親友|員工|特殊關係|債權|債務|未登記|瑕疵|凶宅|毛胚|含.*裝潢|政府機關|法拍|急買急賣|共有物|持分")
START_SEASON = "112S1"   # 從 2023 年起，供建物移轉棟數逐年統計
RES_TYPES = ("住宅大樓", "華廈", "公寓", "透天厝", "套房")
DISTRICT_ID = {
    "竹北市": "zhubei", "湖口鄉": "hukou", "竹東鎮": "zhudong", "新豐鄉": "xinfeng", "芎林鄉": "qionglin",
    "關西鎮": "guanxi", "新埔鎮": "xinpu", "北埔鄉": "beipu", "寶山鄉": "baoshan", "橫山鄉": "hengshan",
    "峨眉鄉": "emei", "五峰鄉": "wufeng", "尖石鄉": "jianshi", "東區": "east", "北區": "north", "香山區": "xiangshan",
}


def recent_seasons(n=9, today=None):
    today = today or date.today()
    y, q = today.year - 1911, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        out.append(f"{y}S{q}")
        q -= 1
        if q == 0:
            y, q = y - 1, 4
    return out[::-1]


def seasons_since(start=START_SEASON, today=None):
    today = today or date.today()
    y, q = int(start[:3]), int(start[-1])
    ty, tq = today.year - 1911, (today.month - 1) // 3 + 1
    out = []
    while (y, q) <= (ty, tq):
        out.append(f"{y}S{q}")
        q += 1
        if q == 5:
            y, q = y + 1, 1
    return out


def recent_batches(today=None):
    """本季開始到今天的每 10 天批次代號，例如 B20261001、B20261011……；最後加上「本期」CUR。"""
    today = today or date.today()
    start = date(today.year, (today.month - 1) // 3 * 3 + 1, 1)
    out, d = [], start
    while d <= today:
        for day in (1, 11, 21):
            x = date(d.year, d.month, day)
            if start <= x <= today:
                out.append("B" + x.strftime("%Y%m%d"))
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out + ["CUR"]


def _get(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _current_zip():
    """「本期」資料是一個一個 CSV，下載後打包成 zip，讓後面的流程一樣處理。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in CUR_FILES:
            q = "PayType=saleremark&" if "buildcase" in f else ""
            try:
                b = _get(CUR_URL.format(q=q, f=f), 60)
                if b and not b.lstrip().startswith(b"<"):
                    z.writestr(f, b)
            except Exception as e:
                print(f"  ! 本期 {f} 下載失敗：{e}", file=sys.stderr)
    return buf.getvalue()


def load_zip_bytes(season, local_dir=None):
    if local_dir:
        for name in (f"{season}.zip", f"{season}_lvr_landcsv.zip", "lvr_landcsv.zip"):
            p = os.path.join(local_dir, name)
            if os.path.exists(p):
                return open(p, "rb").read()
        return None
    try:
        if season == "CUR":
            b = _current_zip()
        elif season.startswith("B"):
            b = _get(HIST_URL.format(d=season[1:]))
        else:
            b = _get(URL.format(s=season))
        return b if b[:2] == b"PK" else None
    except Exception as e:
        print(f"  ! {season} 下載失敗：{e}", file=sys.stderr)
        return None


def col(row, *keys):
    """欄位名稱各期略有不同，以關鍵字模糊比對。"""
    for k in row:
        if k and all(x in k for x in keys):
            return row[k] or ""
    return ""


def num(x):
    try:
        return float(str(x).replace(",", ""))
    except ValueError:
        return 0.0


def roc_date(s):
    s = re.sub(r"\D", "", s or "")
    if len(s) < 7:
        return None
    try:
        return date(int(s[:-4]) + 1911, int(s[-4:-2]), int(s[-2:]))
    except ValueError:
        return None


def parse_rows(zbytes, prefix, kind):
    """kind: 'a' 不動產買賣（中古/成屋）、'b' 預售屋買賣"""
    zf = zipfile.ZipFile(io.BytesIO(zbytes))
    name = f"{prefix}_lvr_land_{kind}.csv"
    if name not in zf.namelist():
        return []
    text = zf.read(name).decode("utf-8-sig", errors="ignore")
    rows = list(csv.DictReader(io.StringIO(text)))
    return rows[1:]  # 第 2 列為英文欄名


PARK_MED = {}   # (行政區, 車位類別) → 單一車位價格中位數（元），用來扣除「車位未分開計價」的成交


def n_parks(row):
    m = re.search(r"車位(\d+)", col(row, "交易筆棟數"))
    return int(m.group(1)) if m and int(m.group(1)) > 0 else 1


def unit_price(row, dist=None):
    """回傳每坪單價（萬），非住宅或無法合理扣除車位則回傳 None。
    車位有成交但沒有分開標價時：若有車位面積、且同行政區同類車位有 5 筆以上分開標價的成交，
    就用該中位數估算車位價格扣除；否則不納入。"""
    target = col(row, "交易標的")
    if "建物" not in target:
        return None
    btype = col(row, "建物型態")
    if not btype.startswith(RES_TYPES):
        return None
    if EXCLUDE_NOTE.search(col(row, "備註")):
        return None
    total = num(col(row, "總價元"))
    area = num(col(row, "建物移轉總面積"))
    p_area = num(col(row, "車位移轉總面積"))
    p_price = num(col(row, "車位總價"))
    ptype = col(row, "車位類別").strip()
    if ptype and p_price <= 0:                # 車位未分開標價 → 用同區同類車位中位數估算
        est = PARK_MED.get((dist, ptype)) if dist else None
        if not est or p_area <= 0:
            return None
        p_price = est * n_parks(row)
    a = area - p_area
    if total <= 0 or a <= 3:
        return None
    up = (total - p_price) / (a / PING) / 1e4
    return up if 3 <= up <= 200 else None


def roc_to_iso(x):
    x = re.sub(r"\D", "", x or "")
    if len(x) < 7:
        return ""
    return f"{int(x[:-4]) + 1911}-{x[-4:-2]}-{x[-2:]}"


def read_builders(zbytes):
    """讀預售屋建案備查資料（*_lvr_buildcase.csv）：建案名稱 → {起造人, 地址, 戶數, 銷售期間, 建照日期, 備查日期, 行政區}"""
    out = {}
    try:
        zf = zipfile.ZipFile(io.BytesIO(zbytes))
    except Exception:
        return out
    for nm in zf.namelist():
        if not nm.lower().endswith(".csv") or not nm.lower().startswith(("o_", "j_")):
            continue
        text = zf.read(nm).decode("utf-8-sig", errors="ignore")
        head = text.split("\n", 1)[0]
        if "起造人" not in head or "建案名稱" not in head:
            continue
        for row in csv.DictReader(io.StringIO(text)):
            n, b = col(row, "建案名稱").strip(), col(row, "起造人").strip()
            if not n or not b or n == "建案名稱" or b == "BUILDER":
                continue
            u = re.sub(r"\D", "", col(row, "層棟戶數"))
            out[n] = {"dev": b, "addr": col(row, "坐落街道").strip(), "units": int(u) if u else None,
                      "sales": col(row, "銷售期間").strip().strip(";"), "permit": roc_to_iso(col(row, "建照核發日期")),
                      "declared": roc_to_iso(col(row, "申報備查日期")), "town": col(row, "鄉鎮市區").strip()}
    return out


def read_parks(zbytes):
    """讀 *_lvr_land_b_park.csv（預售屋車位明細）：編號 → [(車位類別, 價格萬, 面積坪, 所在樓層)]"""
    out = defaultdict(list)
    try:
        zf = zipfile.ZipFile(io.BytesIO(zbytes))
    except Exception:
        return out
    for nm in zf.namelist():
        low = nm.lower()
        if not (low.startswith(("o_", "j_")) and "_b_park" in low):
            continue
        text = zf.read(nm).decode("utf-8-sig", errors="ignore")
        for row in list(csv.DictReader(io.StringIO(text)))[1:]:
            k = col(row, "編號")
            if not k:
                continue
            out[k].append((col(row, "車位類別"), round(num(col(row, "車位價格")) / 1e4, 1),
                           round(num(col(row, "車位面積")) / PING, 2), col(row, "車位所在樓層")))
    return out


CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def floor_num(s):
    """「十二層」「地下一層」→ 12 / -1；無法判斷回傳 None"""
    s = (s or "").split("，")[0].split(",")[0]
    neg = s.startswith("地下")
    s = s.replace("地下", "").replace("層", "").replace("樓", "").strip()
    if s.isdigit():
        n = int(s)
    else:
        n, cur = 0, 0
        for ch in s:
            if ch == "十":
                cur = (cur or 1) * 10
                n += cur
                cur = 0
            elif ch in CN_NUM:
                cur = CN_NUM[ch]
            else:
                return None
        n += cur
        if n == 0:
            return None
    return -n if neg else n


def deal_detail(row, d, up, parks):
    """單筆預售成交明細（金額單位：萬元；面積單位：坪）"""
    total = num(col(row, "總價元")) / 1e4
    p_price = num(col(row, "車位總價")) / 1e4
    area = num(col(row, "建物移轉總面積")) / PING
    p_area = num(col(row, "車位移轉總面積")) / PING
    main = num(col(row, "主建物面積")) / PING
    ptype = col(row, "車位類別").strip()
    note = col(row, "備註").strip()
    cancel = col(row, "解約情形").strip()
    floor_s = col(row, "移轉層次")
    return {
        "d": d.isoformat(), "unit": col(row, "棟及號").strip(), "floor": floor_s, "fn": floor_num(floor_s),
        "tf": floor_num(col(row, "總樓層數")), "rooms": f'{col(row, "建物現況格局-房") or "0"}房{col(row, "建物現況格局-廳") or "0"}廳{col(row, "建物現況格局-衛") or "0"}衛',
        "area": round(area, 2), "main": round(main, 2) if main else None, "parea": round(p_area, 2), "net": round(area - p_area, 2),
        "ptype": ptype, "pcount": len(parks) if parks else (1 if ptype else 0),
        "pprice": round(p_price, 1) if p_price else (0 if not ptype else None),
        "parks": [list(x) for x in parks],
        "total": round(total, 1), "house": round(total - p_price, 1), "up": round(up, 2) if up else None,
        "note": note, "cancel": cancel,
    }


AGE_BANDS = [("0-10", 0, 10), ("11-20", 11, 20), ("21-30", 21, 30), ("31+", 31, 999)]


def age_band(row, d):
    """屋齡（交易日 − 建築完成日，取整數年）所屬區間；無建築完成日回傳 None"""
    b = roc_date(col(row, "建築完成"))
    if not b or b > d:
        return "0-10" if b else None
    y = (d - b).days // 365
    return next(k for k, lo, hi in AGE_BANDS if lo <= y <= hi or (k == "0-10" and y < 0))


def quarter(d):
    return f"{d.year}Q{(d.month - 1) // 3 + 1}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*")
    ap.add_argument("--local")
    ap.add_argument("--out", default="src/data/build.json")
    a = ap.parse_args()
    seasons = a.seasons or (seasons_since() + recent_batches())

    deals = {"a": [], "b": []}   # (region, district, date, price)
    proj = defaultdict(lambda: {"ups": [], "tot": [], "dates": [], "n": 0})  # 預售建案統計
    builders = {}
    seen = set()
    raw = []                     # (kind, region, district, date, row, parks)
    for s in seasons:
        print(f"→ {s}")
        z = load_zip_bytes(s, a.local)
        if not z:
            continue
        builders.update(read_builders(z))
        parks = read_parks(z)
        for prefix, region in CITIES.items():
            for kind in ("a", "b"):
                for row in parse_rows(z, prefix, kind):
                    key = col(row, "編號") or id(row)
                    if key in seen:
                        continue
                    seen.add(key)
                    d = roc_date(col(row, "交易年月日"))
                    if not d:
                        continue
                    dn = col(row, "鄉鎮市區")
                    if region == "city":     # 新竹市原始資料不分區，用門牌地址判斷東區／北區／香山區
                        dn = city_district(col(row, "土地位置建物門牌")) or "新竹市"
                    raw.append((kind, region, dn, d, row, parks.get(key, [])))

    # 先算各行政區「分開標價」的單一車位價格中位數（近兩年），給車位未分開標價的成交估算扣除
    last = max(x[3] for x in raw)
    pk = defaultdict(list)
    for kind, region, dn, d, row, _ in raw:
        if kind != "a" or d < last - timedelta(days=730):
            continue
        t, pp = col(row, "車位類別").strip(), num(col(row, "車位總價元"))
        if t and pp > 0:
            pk[(dn, t)].append(pp / n_parks(row))
    PARK_MED.clear()
    PARK_MED.update({k: statistics.median(v) for k, v in pk.items() if len(v) >= 5})

    pm = defaultdict(lambda: {"city": [0.0, 0], "county": [0.0, 0]})   # 月 → 縣市 → [總價萬元, 戶數]
    bulk = 0
    ages = []   # 中古屋（成屋）依屋齡分組：(region, dist, date, 單價, 屋齡區間)
    years = defaultdict(lambda: defaultdict(lambda: [0, 0]))   # (region, dist) → year → [成屋買賣建物棟數, 預售簽約戶數]
    for kind, region, dn, d, row, prk in raw:
        up = unit_price(row, dn if kind == "a" else None)
        if up:
            deals[kind].append((region, dn, d, up))
            if kind == "a":
                ages.append((region, dn, d, up, age_band(row, d)))
        if d.year >= 2023:
            if kind == "a":
                m = re.search(r"建物(\d+)", col(row, "交易筆棟數"))
                if m and int(m.group(1)) > 0:
                    years[(region, dn)][d.year][0] += int(m.group(1))
            elif not col(row, "解約情形").strip():
                years[(region, dn)][d.year][1] += 1
        # 預售屋每月成交總金額：排除解約、單筆 500 坪以上的整棟或廠辦交易
        if kind == "b" and not col(row, "解約情形").strip():
            if num(col(row, "建物移轉總面積")) / PING >= 500:
                bulk += 1
            else:
                o = pm[d.strftime("%Y-%m")][region]
                o[0] += num(col(row, "總價元")) / 1e4
                o[1] += 1
        name = col(row, "建案名稱").strip() if kind == "b" else ""
        if name:
            k = (region, col(row, "鄉鎮市區"), name)
            P = proj[k]
            P["n"] += 1
            P["dates"].append(d)
            P.setdefault("deals", []).append(deal_detail(row, d, up, prk))
            if up:
                P["ups"].append(up)
                P["tot"].append(num(col(row, "總價元")) / 1e4)

    if not deals["a"]:
        sys.exit("沒有取得任何資料，請確認網路或改用 --local 指定已下載的 zip。")

    latest = max(x[2] for x in deals["a"] + deals["b"])
    since = latest - timedelta(days=183)

    def med(vals):
        return round(statistics.median(vals), 1) if vals else None

    def age_stats(xs):
        """各屋齡區間的每坪中位數；少於 5 筆不給中位數"""
        o = {}
        for k, _, _ in AGE_BANDS:
            v = [x[3] for x in xs if x[4] == k]
            o[k] = {"n": len(v), "med": med(v) if len(v) >= 5 else None}
        return o

    out = {"meta": {"synced": date.today().isoformat(), "latestDeal": latest.isoformat(),
                    "note": "由 build_data.py 依內政部實價登錄原始資料計算（新竹市 O、新竹縣 J）。"},
           "regions": {}, "districts": {}}

    for region in ("city", "county"):
        used = [p for r, _, d, p in deals["a"] if r == region and d >= since]
        pre = [p for r, _, d, p in deals["b"] if r == region and d >= since]
        byq = defaultdict(list)
        for r, _, d, p in deals["a"]:
            if r == region:
                byq[quarter(d)].append(p)
        cur_q = quarter(latest)
        trend = [[q, len(v), med(v)] for q, v in sorted(byq.items()) if q != cur_q and len(v) >= 5][-8:]
        out["regions"][region] = {"ages": age_stats([x for x in ages if x[0] == region and x[2] >= since]),
                                  "used": med(used), "usedN": len(used),
                                  "presale": med(pre), "presaleN": len(pre), "trend": trend}

    for name, did in DISTRICT_ID.items():
        used = [p for _, dn, d, p in deals["a"] if dn == name and d >= since]
        pre = [p for _, dn, d, p in deals["b"] if dn == name and d >= since]
        n = len(used)
        out["districts"][did] = {
            "ages": age_stats([x for x in ages if x[1] == name and x[2] >= since]),
            "used": med(used) if n >= 5 else None, "n": n,
            "presale": med(pre) if len(pre) >= 5 else None, "pn": len(pre),
            "tier": "main" if n >= 20 else "ref" if n >= 5 else "low",
        }

    # 各行政區逐年交易量（依成交／簽約日期）：成屋買賣建物棟數、預售屋簽約戶數
    lastA = max(d for k, _, _, d, _, _ in raw if k == "a")
    out["volume"] = {"years": list(range(2023, lastA.year + 1)), "lastA": lastA.isoformat(),
                     "lastB": max(d for k, _, _, d, _, _ in raw if k == "b").isoformat(),
                     "rows": [{"r": r, "dist": dn, "y": {str(y): v for y, v in sorted(ys.items())}}
                              for (r, dn), ys in sorted(years.items())]}

    out["presaleMonthly"] = {"bulkExcluded": bulk,
                             "months": {m: {r: [round(v[0]), v[1]] for r, v in x.items()} for m, x in sorted(pm.items())}}

    # 預售建案：近兩年有揭露成交者
    cutoff = latest - timedelta(days=730)
    plist, deals_out = [], {}
    for (region, dn, name), P in proj.items():
        last = max(P["dates"])
        if last < cutoff:
            continue
        ups = P["ups"]
        plist.append({
            "name": name, "r": region, "dist": dn, "n": P["n"], "latest": last.isoformat(),
            "med": med(ups) if len(ups) >= 3 else None,
            "min": round(min(ups), 1) if ups else None, "max": round(max(ups), 1) if ups else None,
            "medTotal": round(statistics.median(P["tot"])) if P["tot"] else None,
            **({k: v for k, v in (builders.get(name) or builders.get(re.sub(r"\s", "", name)) or {}).items() if k != "town"}),
        })
        deals_out[f"{region}|{dn}|{name}"] = sorted(P.get("deals", []), key=lambda x: x["d"], reverse=True)
    plist.sort(key=lambda x: (-x["n"], x["name"]))
    out["projects"] = plist
    deals_path = os.path.join(os.path.dirname(a.out) or ".", "presale_deals.json")
    with open(deals_path, "w", encoding="utf-8") as f:
        json.dump(deals_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"✓ 預售成交明細 {sum(len(v) for v in deals_out.values())} 筆 → {deals_path}")

    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"✓ 寫入 {a.out}：中古 {len(deals['a'])} 筆、預售 {len(deals['b'])} 筆；最新成交 {latest}")


if __name__ == "__main__":
    main()
