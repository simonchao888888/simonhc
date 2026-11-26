#!/usr/bin/env python3
"""
新竹縣市租金行情：讀內政部實價登錄「租賃」資料（o_lvr_land_c.csv 新竹市、j_lvr_land_c.csv 新竹縣），
輸出 src/data/rent.json。

計算原則
- 只算住宅：住宅大樓、華廈、公寓、透天厝、套房；排除店面、辦公、廠辦、工廠等。
- 備註含親友、員工、關係人等特殊關係的租約排除。
- 整戶出租：月租扣掉車位租金後，除以建物總面積（坪）得每坪月租；依房數分 1／2／3／4 房以上。
- 套房：獨立套房與分租套房合併，看每間月租中位數。
- 全部用中位數，樣本少於 5 筆不公布。

用法
  python3 scripts/build_rent.py                       # 自動下載最近 4 季
  python3 scripts/build_rent.py --seasons 115S2 115S3
  python3 scripts/build_rent.py --raw rent_raw.json   # 使用已下載的 CSV 文字（鍵為 季別_檔名）
"""
import argparse, csv, io, json, re, statistics, sys, zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_data import load_zip_bytes, recent_seasons, recent_batches  # noqa: E402
from city_district import city_district  # noqa: E402

PING = 3.30579
SEED = Path(__file__).parent.parent / "src/data/seed.json"
APT = ("住宅大樓", "華廈", "公寓")
SPECIAL = re.compile(r"親友|員工|關係人|特殊|二親等|股東")


def roc(s):
    s = (s or "").strip()
    if len(s) < 7:
        return None
    return f"{int(s[:-4]) + 1911}-{s[-4:-2]}-{s[-2:]}"


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def med(v, nd=0):
    if len(v) < 5:
        return None
    m = statistics.median(v)
    return round(m, nd) if nd else int(round(m, -2))


def rows_from_csv(text):
    text = text.lstrip("﻿")
    lines = text.splitlines()
    # 內政部原始檔第二列是英文欄名，要跳過
    if len(lines) > 1 and lines[1].startswith("The villages"):
        lines = [lines[0]] + lines[2:]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))


def classify(r):
    kind = r.get("建物型態", "")
    use = r.get("主要用途", "")
    if any(x in kind for x in ("店面", "辦公", "廠辦", "工廠", "倉庫", "農舍", "其他")):
        return None
    if "住" not in use and "套房" not in kind and not any(x in kind for x in APT + ("透天",)):
        return None
    if SPECIAL.search(r.get("備註", "")):
        return None
    t = r.get("出租型態", "")
    if t in ("獨立套房", "分租套房") or "套房" in kind:
        return "suite"
    if t == "整棟(戶)出租":
        return "apt" if any(x in kind for x in APT) else ("house" if "透天" in kind else None)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="*")
    ap.add_argument("--raw")
    ap.add_argument("--out", default="src/data/rent.json")
    a = ap.parse_args()

    files = {}  # (season, prefix) -> csv text
    if a.raw:
        for k, v in json.load(open(a.raw, encoding="utf-8")).items():
            s, name = k.split("_", 1)
            files[(s, name[0])] = v
    else:
        for s in a.seasons or (recent_seasons(4) + recent_batches()):
            zb = load_zip_bytes(s)
            if not zb:
                continue
            with zipfile.ZipFile(io.BytesIO(zb)) as z:
                for p in "oj":
                    try:
                        files[(s, p)] = z.read(f"{p}_lvr_land_c.csv").decode("utf-8")
                    except KeyError:
                        pass
    if not files:
        sys.exit("沒有租賃資料")

    seed = json.load(open(SEED, encoding="utf-8"))
    name2id = {d["name"]: d["id"] for d in seed["districts"]}

    groups = {}  # key -> dict(perPing=[], rooms={1:[],...}, suite=[], house=[], n=0)

    def g(key):
        return groups.setdefault(key, {"perPing": [], "apt": [], "rooms": {"1": [], "2": [], "3": [], "4+": []},
                                       "suite": [], "house": []})

    latest, earliest, seen, recs = "", "9999", set(), []
    for (s, p), text in sorted(files.items()):
        region = "city" if p == "o" else "county"
        for r in rows_from_csv(text):
            k = classify(r)
            if not k:
                continue
            key = (r.get("鄉鎮市區"), r.get("租賃年月日"), r.get("總額元"), r.get("建物總面積平方公尺"))
            if key in seen:
                continue
            seen.add(key)
            d = roc(r.get("租賃年月日"))
            if d and d > latest:
                latest = d
            if d and d < earliest:
                earliest = d
            rent = num(r.get("總額元")) - num(r.get("車位總額元"))
            area = num(r.get("建物總面積平方公尺")) / PING
            if not (2000 <= rent <= 300000):
                continue
            recs.append((region, r, k, rent, area))

    # 第二輪：整戶出租每坪月租偏離全縣（市）中位數太多的（企業包租宿舍、含家具商務租約等）排除
    base = {}
    for reg in ("city", "county"):
        v = [rent / area for rg, _, k, rent, area in recs if rg == reg and k == "apt" and 5 <= area <= 150]
        base[reg] = statistics.median(v) if v else 0
    def keep(region, k, rent, area):
        return not (k == "apt" and base[region] and not (0.4 <= (rent / area if area else 0) / base[region] <= 2.2))

    # 鄉鎮每坪月租比全縣高出 4 成以上（多半是少數企業整批包租），不併入全縣統計
    by_d = {}
    for region, r, k, rent, area in recs:
        if region == "county" and k == "apt" and 5 <= area <= 150 and keep(region, k, rent, area):
            by_d.setdefault(r.get("鄉鎮市區"), []).append(rent / area)
    skewed_names = {nm for nm, v in by_d.items() if len(v) >= 5 and statistics.median(v) > base["county"] * 1.4}
    for region, r, k, rent, area in recs:
        if not keep(region, k, rent, area):
            continue
        if True:  # noqa: 保持區塊縮排
            targets = [] if r.get("鄉鎮市區") in skewed_names else [g(region)]
            # 新竹市原始資料不分區，用門牌地址判斷東區／北區／香山區
            did = name2id.get(r.get("鄉鎮市區") if region == "county" else city_district(r.get("土地位置建物門牌")))
            if did:
                targets.append(g(did))
            for t in targets:
                if k == "suite":
                    t["suite"].append(rent)
                elif k == "house":
                    t["house"].append(rent)
                elif k == "apt" and 5 <= area <= 150:
                    t["apt"].append(rent)
                    t["perPing"].append(rent / area)
                    rooms = int(num(r.get("建物現況格局-房")))
                    if rooms >= 1:
                        t["rooms"]["4+" if rooms >= 4 else str(rooms)].append(rent)

    def summary(v):
        return {
            "aptN": len(v["apt"]), "apt": med(v["apt"]),
            "perPing": round(statistics.median(v["perPing"])) if len(v["perPing"]) >= 5 else None,
            "rooms": {k: {"n": len(x), "rent": med(x)} for k, x in v["rooms"].items()},
            "suiteN": len(v["suite"]), "suite": med(v["suite"]),
            "houseN": len(v["house"]), "house": med(v["house"]),
        }

    out = {
        "meta": {
            "seasons": sorted({s for s, _ in files}),
            "latest": latest,
            "earliest": earliest,
            "note": "由 build_rent.py 依內政部實價登錄租賃資料計算；只含住宅，排除特殊關係租約，皆為中位數。",
        },
        "regions": {k: summary(groups[k]) for k in ("city", "county") if k in groups},
        "districts": {k: summary(v) for k, v in groups.items() if k not in ("city", "county")},
    }
    # 鄉鎮每坪月租比全縣高出 4 成以上，多半是少數企業整批包租，標記為偏誤樣本、頁面上不當作行情
    for k, v in out["districts"].items():
        v["skewed"] = any(name2id.get(nm) == k for nm in skewed_names)
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    c = out["regions"]
    print(f"rent: {a.out}  最新 {latest}  市整戶 {c['city']['aptN']} 筆、縣整戶 {c['county']['aptN']} 筆")


if __name__ == "__main__":
    main()
