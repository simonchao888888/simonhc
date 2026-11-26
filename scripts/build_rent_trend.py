#!/usr/bin/env python3
"""
新竹縣市租金逐年變化：2024 年起每年（依租約日期）整戶出租的月租中位數，
分「房數」（1／2／3／4 房以上）與「屋齡」（10 年內／11–20／21–30／30 年以上）。
輸出 src/data/rent_trend.json，供租金頁長條圖使用。

口徑與 build_rent.py 相同：
- 整戶出租的住宅大樓、華廈、公寓（不含透天整棟、套房）；排除特殊關係租約。
- 月租扣掉車位租金；建物面積 5～150 坪。
- 每坪月租偏離該縣市當年中位數太多（< 0.4 倍或 > 2.2 倍）的排除（企業包租、含家具商務約）。
- 新竹縣每坪月租比全縣高 4 成以上的鄉鎮（多為企業整批包租，例如關西）不併入。
- 屋齡 = 租約日 − 建築完成日；樣本少於 5 筆不給中位數。

用法：python3 scripts/build_rent_trend.py [--local 已下載 zip 的資料夾]
"""
import argparse, io, json, statistics, sys, zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_data import load_zip_bytes, seasons_since, recent_batches, AGE_BANDS  # noqa: E402
from build_rent import rows_from_csv, classify, num, roc, PING  # noqa: E402

START_YEAR = 2024


def med(v):
    return int(round(statistics.median(v), -2)) if len(v) >= 5 else None


def age_key(built, d):
    if not built:
        return None
    y = (d - built).days // 365
    return next((k for k, lo, hi in AGE_BANDS if lo <= max(y, 0) <= hi), None)


def to_date(s):
    x = roc(s)
    try:
        return date.fromisoformat(x) if x else None
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local")
    ap.add_argument("--out", default="src/data/rent_trend.json")
    a = ap.parse_args()

    recs, seen, latest = [], set(), date(2000, 1, 1)
    # 2024 年 1 月的租約最晚在 2 月申報，113S1（民國 113 年第 1 季）起就涵蓋完整
    for s in seasons_since(f"{START_YEAR - 1911}S1") + recent_batches():
        zb = load_zip_bytes(s, a.local)
        if not zb:
            continue
        with zipfile.ZipFile(io.BytesIO(zb)) as z:
            for p, region in (("o", "city"), ("j", "county")):
                try:
                    text = z.read(f"{p}_lvr_land_c.csv").decode("utf-8", errors="ignore")
                except KeyError:
                    continue
                for r in rows_from_csv(text):
                    if classify(r) != "apt":
                        continue
                    key = r.get("編號") or (r.get("鄉鎮市區"), r.get("租賃年月日"), r.get("總額元"), r.get("建物總面積平方公尺"))
                    if key in seen:
                        continue
                    seen.add(key)
                    d = to_date(r.get("租賃年月日"))
                    if not d or d.year < START_YEAR or d > date.today():
                        continue
                    rent = num(r.get("總額元")) - num(r.get("車位總額元"))
                    area = num(r.get("建物總面積平方公尺")) / PING
                    if not (2000 <= rent <= 300000 and 5 <= area <= 150):
                        continue
                    rooms = int(num(r.get("建物現況格局-房")))
                    recs.append({"r": region, "town": r.get("鄉鎮市區"), "y": d.year, "rent": rent, "pp": rent / area,
                                 "rooms": ("4+" if rooms >= 4 else str(rooms)) if 1 <= rooms <= 8 else None,
                                 "age": age_key(to_date(r.get("建築完成年月")), d)})
                    latest = max(latest, d)
    if not recs:
        sys.exit("沒有租賃資料")

    # 各縣市、各年的每坪月租中位數，用來排除離群租約
    base = {(r, y): statistics.median([x["pp"] for x in recs if x["r"] == r and x["y"] == y])
            for r, y in {(x["r"], x["y"]) for x in recs}}
    recs = [x for x in recs if 0.4 <= x["pp"] / base[(x["r"], x["y"])] <= 2.2]
    # 新竹縣企業包租偏高的鄉鎮
    cty = statistics.median([x["pp"] for x in recs if x["r"] == "county"])
    by_t = defaultdict(list)
    for x in recs:
        if x["r"] == "county":
            by_t[x["town"]].append(x["pp"])
    skewed = sorted(t for t, v in by_t.items() if len(v) >= 5 and statistics.median(v) > cty * 1.4)
    recs = [x for x in recs if not (x["r"] == "county" and x["town"] in skewed)]

    years = sorted({x["y"] for x in recs})
    out = {"meta": {"latest": latest.isoformat(), "years": years, "skewedExcluded": skewed,
                    "note": "整戶出租的大樓、華廈、公寓；依租約日期歸年，月租已扣車位，皆為中位數。"},
           "regions": {}}
    for region in ("city", "county"):
        R = {}
        for y in years:
            xs = [x for x in recs if x["r"] == region and x["y"] == y]
            R[str(y)] = {
                "all": {"n": len(xs), "rent": med([x["rent"] for x in xs]), "pp": med([x["pp"] for x in xs]) and round(statistics.median([x["pp"] for x in xs]))},
                "rooms": {k: {"n": len(v), "rent": med(v)} for k in ("1", "2", "3", "4+") for v in [[x["rent"] for x in xs if x["rooms"] == k]]},
                "ages": {k: {"n": len(v), "rent": med([x["rent"] for x in v]), "pp": round(statistics.median([x["pp"] for x in v])) if len(v) >= 5 else None}
                         for k, _, _ in AGE_BANDS for v in [[x for x in xs if x["age"] == k]]},
            }
        out["regions"][region] = R
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    c = out["regions"]["city"]
    print(f"rent trend: {a.out} 最新 {latest}；新竹市 " + "、".join(f"{y} {c[str(y)]['all']['n']} 筆" for y in years))


if __name__ == "__main__":
    main()
