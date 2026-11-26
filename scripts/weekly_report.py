#!/usr/bin/env python3
"""
新竹房市週報（或雙週報）：比較這一期和上一期的資料，自動寫一篇週報到 src/content/weekly/。

內容只放「數字與事實」，不放觀點，所以可以自動發布：
- 實價登錄最新揭露到哪一天、新竹縣市與各區中古／預售中位數的變化
- 這一期新增的預售屋成交：哪些建案賣最多、新出現的建案
- 租金中位數變化
- 央行利率、下次理監事會、五大銀行房貸利率
- 這一期的政策與市場新聞標題（連到原文）、本站新發布的判讀
- 下一期要注意的日期

每次執行後把本期數字存成快照 src/data/snapshots/YYYY-MM-DD.json，下一期拿來比較。

用法：python3 scripts/weekly_report.py [--days 7] [--date 2026-11-30]
"""
import argparse, json, statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "src/data"
SNAP = DATA / "snapshots"
OUT = ROOT / "src/content/weekly"
RNAME = {"city": "新竹市", "county": "新竹縣"}
ALIAS = {"森?": "森藴"}


def load(name, default=None):
    p = DATA / name
    return json.load(open(p, encoding="utf-8")) if p.exists() else default


def f1(x):
    return "—" if x is None else f"{x:.1f}"


def chg(new, old, unit=""):
    if new is None or old is None:
        return ""
    d = new - old
    if abs(d) < 0.05:
        return "（持平）"
    return f"（{'+' if d > 0 else '−'}{abs(d):.1f}{unit}）"


def money(x):
    return "—" if x is None else f"{x:,.0f}"


def snapshot(build, deals, rent):
    return {
        "latestDeal": build["meta"]["latestDeal"],
        "method": build["meta"].get("method", "v1"),
        "regions": {k: {x: v.get(x) for x in ("used", "usedN", "presale", "presaleN")} for k, v in build["regions"].items()},
        "districts": {k: {x: v.get(x) for x in ("used", "n", "presale", "pn", "tier")} for k, v in build["districts"].items()},
        "projects": {k: len([d for d in v if not d.get("cancel")]) for k, v in deals.items()},
        "rent": {k: {"apt": v["apt"], "perPing": v["perPing"]} for k, v in (rent or {}).get("regions", {}).items()},
    }


def next_dates(today, days):
    """下一期要注意的日期：實價登錄揭露日、月底前後五大銀行利率公布。"""
    out, d = [], today + timedelta(days=1)
    while d <= today + timedelta(days=days):
        if d.day in (1, 11, 21):
            out.append((d, "內政部實價登錄揭露新一批成交"))
        if d.day == 22:
            out.append((d, "五大銀行新承做房貸利率公布（約 20～25 日）"))
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7, help="這一期涵蓋幾天：7＝週報、14＝雙週報")
    ap.add_argument("--date", help="報告日期，預設今天")
    ap.add_argument("--no-snapshot", action="store_true", help="測試用：不寫入快照")
    a = ap.parse_args()
    today = date.fromisoformat(a.date) if a.date else date.today()
    since = today - timedelta(days=a.days)
    label = "週報" if a.days <= 7 else "雙週報"

    build, deals, rent = load("build.json"), load("presale_deals.json"), load("rent.json")
    news, feed, seed = load("news.json"), load("news_feed.json", {"items": []}), load("seed.json")
    dname = {d["id"]: d["name"] for d in seed["districts"]}
    cur = snapshot(build, deals, rent)

    prev_files = sorted(p for p in SNAP.glob("*.json") if p.stem < today.isoformat()) if SNAP.exists() else []
    prev = json.load(open(prev_files[-1], encoding="utf-8")) if prev_files else None
    prev_date = prev_files[-1].stem if prev_files else None

    # 統計口徑或資料範圍不同（例如 v1→v2 補入 2019 年起舊制成交）時，不和上一期比較，避免把口徑調整誤當成漲跌或新增成交
    prev_method = (prev or {}).get("method", "v1")
    method_changed = prev is not None and prev_method != cur["method"]
    if method_changed:
        prev = {**prev, "regions": {}, "districts": {}}

    # ---- 預售屋：這一期新增的成交 ----
    rows = []
    for key, v in deals.items():
        live = sorted([d for d in v if not d.get("cancel")], key=lambda d: d["d"])
        if method_changed:
            new = []                                    # 口徑調整這一期不計算「新增」
        elif prev is not None:
            n_new = len(live) - prev["projects"].get(key, 0)
            new = live[-n_new:] if n_new > 0 else []
        else:  # 第一期沒有比較基準：用最新揭露日前 30 天內的成交
            cut = (date.fromisoformat(cur["latestDeal"]) - timedelta(days=30)).isoformat()
            new = [d for d in live if d["d"] >= cut]
        if new:
            r, dist, nm = key.split("|")
            rows.append({"key": key, "r": r, "dist": dist, "name": ALIAS.get(nm, nm), "n": len(new),
                         "up": statistics.median([d["up"] for d in new if d.get("up")] or [0]) or None,
                         "total": statistics.median([d["total"] for d in new if d.get("total")] or [0]) or None,
                         "isNew": prev is not None and key not in prev["projects"]})
    rows.sort(key=lambda x: -x["n"])
    new_total = sum(x["n"] for x in rows)
    fresh = [x for x in rows if x["isNew"]]

    # 建案頁網址
    import hashlib
    featured = load("presale_projects.json", {})
    featured = featured.get("featured", []) if isinstance(featured, dict) else featured
    proj_by_key = {f"{p['r']}|{p.get('dist') or ''}|{p['name']}": p for p in build["projects"]}

    def page_of(x):
        fid = next((f.get("id") for f in featured if f.get("name") == x["name"]), None)
        if fid:
            return f"/presale/{fid}/"
        p = next((p for k, p in proj_by_key.items() if p["name"] == x["key"].split("|")[2] and p["r"] == x["r"]), None)
        dist = (p or {}).get("dist", x["dist"])
        return "/presale/p" + hashlib.md5(f"{x['r']}|{dist}|{x['key'].split('|')[2]}".encode()).hexdigest()[:8] + "/"

    # ---- 新聞：這一期的標題與本站判讀 ----
    items = [i for i in feed.get("items", []) if since.isoformat() <= i.get("date", "")[:10] <= today.isoformat()]
    seen, heads = set(), []
    for i in sorted(items, key=lambda i: i.get("date", ""), reverse=True):
        k = i["title"][:16]
        if k in seen:
            continue
        seen.add(k)
        heads.append(i)
    takes = [n for n in news["news"] if since.isoformat() <= n["date"] <= today.isoformat()]

    # ---- 重點 ----
    # 統計口徑不同（例如 v1→v2）時不和上一期比較，避免把口徑調整誤當成漲跌
    R, P = cur["regions"], (prev or {}).get("regions", {})
    hl = [f"實價登錄已揭露的最新一筆成交日期是 {cur['latestDeal']}" + (f"（上一期 {prev['latestDeal']}）" if prev and prev["latestDeal"] != cur["latestDeal"] else "") + "。"]
    for k in ("city", "county"):
        hl.append(f"{RNAME[k]}中古屋 {f1(R[k]['used'])} 萬/坪{chg(R[k]['used'], P.get(k, {}).get('used'))}、"
                  f"預售屋 {f1(R[k]['presale'])} 萬/坪{chg(R[k]['presale'], P.get(k, {}).get('presale'))}。")
    if rows:
        top = "、".join(f"{x['name']} {x['n']} 筆" for x in rows[:3])
        hl.append(f"{'這一期' if prev else '最近 30 天'}新增預售屋成交 {new_total} 筆，最多的是 {top}。")
    else:
        hl.append("本期統計口徑調整，預售屋新增成交不和上一期比較，下一期恢復。" if method_changed else "這一期沒有新增的預售屋成交揭露。")
    if fresh:
        hl.append("新出現的建案：" + "、".join(f"{x['name']}（{x['dist'] or RNAME[x['r']]}）" for x in fresh[:6]) + "。")
    pr = news["policyRate"]
    mr = news["mortgageRates"][-1]
    hl.append(f"央行重貼現率 {pr['discount']:g}%，下次理監事會 {pr['nextMeeting']}；五大銀行新承做房貸利率 {mr[1]}%（{mr[0]}）。")

    title = f"新竹房市{label}｜{today.strftime('%Y/%m/%d')}"
    period = f"{since.isoformat()} ～ {today.isoformat()}"
    L = [
        "---",
        f"title: {title}",
        "description: " + json.dumps(hl[1] + (hl[3] if len(hl) > 3 else ""), ensure_ascii=False),
        f"pubDate: {today.isoformat()}",
        f"period: {json.dumps(period, ensure_ascii=False)}",
        f"cadence: {label}",
        "highlights: " + json.dumps(hl, ensure_ascii=False),
        "---",
        "",
        f"這是{label}，涵蓋 {period}。" + (
            f"本期起統計口徑由 {prev_method} 改為 {cur['method']}（說明見[資料來源與統計方法](/sources/#method)），各區房價不和上一期（{prev_date}）直接比較；預售屋新增成交這一期也不比較。" if method_changed
            else f"變化都和上一期（{prev_date}）比較。" if prev else "這是第一期，從下一期開始會標出和上一期比較的變化。")
        + f"數字全部來自內政部實價登錄，單價已扣除車位，皆為中位數（統計口徑 {cur['method']}）。",
        "",
        "### 這一期重點",
        "",
        *[f"- {h}" for h in hl],
        "",
        "### 各區房價",
        "",
        "| 區域 | 中古屋（萬/坪） | 預售屋（萬/坪） | 樣本（中古／預售） |",
        "|---|---|---|---|",
    ]
    for k in ("city", "county"):
        L.append(f"| **{RNAME[k]}** | {f1(R[k]['used'])}{chg(R[k]['used'], P.get(k, {}).get('used'))} | "
                 f"{f1(R[k]['presale'])}{chg(R[k]['presale'], P.get(k, {}).get('presale'))} | {R[k].get('usedN') or '—'}／{R[k].get('presaleN') or '—'} |")
    PD = (prev or {}).get("districts", {})
    for k, v in sorted(cur["districts"].items(), key=lambda kv: -(kv[1].get("n") or 0)):
        if v.get("tier") not in ("main", "ref") or not v.get("used"):
            continue
        o = PD.get(k, {})
        L.append(f"| {dname.get(k, k)} | {f1(v['used'])}{chg(v['used'], o.get('used'))} | "
                 f"{f1(v.get('presale'))}{chg(v.get('presale'), o.get('presale'))} | {v.get('n') or '—'}／{v.get('pn') or '—'} |")
    L += ["", "新竹市的實價登錄沒有分東區、北區、香山區，只能看全市。樣本少於 20 筆的鄉鎮只當參考。", ""]

    L += ["### 預售屋成交", ""]
    if rows:
        L += [f"{'這一期' if prev else '最近 30 天'}揭露的預售屋成交共 **{new_total} 筆**，分布在 {len(rows)} 個建案。", "",
              "| 建案 | 區域 | 新增筆數 | 單價中位數（萬/坪） | 總價中位數（萬） |", "|---|---|---|---|---|"]
        for x in rows[:12]:
            L.append(f"| [{x['name']}]({page_of(x)}){'（新）' if x['isNew'] else ''} | {x['dist'] or RNAME[x['r']]} | {x['n']} | {f1(x['up'])} | {money(x['total'])} |")
        L += ["", "點建案名稱可以看每一戶的樓層、坪數和車位價格。完整列表在[預售建案](/presale/)。", ""]
    else:
        L += ["本期統計口徑調整（補入 2019 年起舊制預售成交），各建案筆數不和上一期比較，下一期恢復計算新增成交。" if method_changed else "這一期沒有新增的預售屋成交揭露。實價登錄每 10 天揭露一次，下一批出來後會更新。", ""]

    if rent and cur["rent"]:
        PR = (prev or {}).get("rent", {})
        L += ["### 租金", "",
              "、".join(f"{RNAME[k]}整戶出租月租中位數 {money(v['apt'])} 元" + (chg(v['apt'] / 1000, PR[k]['apt'] / 1000, ' 千') if PR.get(k) and PR[k].get('apt') and v['apt'] else "")
                       for k, v in cur["rent"].items()) + "。詳細見[租金行情](/rent/)。", ""]

    L += ["### 政策與利率", "",
          f"- 央行重貼現率 {pr['discount']:g}%，{pr['since']} 起已連續 {pr['freezeCount']} 次不變；上次理監事會 {pr['lastMeeting']}，下次 {pr['nextMeeting']}。",
          f"- 五大銀行新承做房貸利率 {mr[1]}%（{mr[0]}），新青安占比 {mr[2]}%。",
          "- 第 2 戶房貸：" + next((f"成數上限 {c[1]}、寬限期 {c[2]}" for c in news["controls"] if c[0].replace(" ", "").endswith("第2戶")), "見[央行與貸款政策](/policy/)") + "。",
          ""]

    if takes:
        L += ["### 本站這一期的判讀", ""] + [f"- [{n['title']}](/news/{n['id']}/)" for n in takes] + [""]
    if heads:
        L += ["### 這一期的政策與市場新聞", "", "以下是新聞標題，點開看原文；有判讀的會另外發布在[新聞判讀](/news/)。", ""]
        for i in heads[:12]:
            L.append(f"- {i['date'][5:10].replace('-', '/')}｜{i.get('topic', '')}｜[{i['title']}]({i['link']})（{i.get('source', '')}）")
        L.append("")

    nd = next_dates(today, max(a.days, 10))
    L += ["### 下一期要注意", ""] + [f"- {d.strftime('%m/%d')}：{t}" for d, t in nd] + [f"- 央行理監事會：{pr['nextMeeting']}", ""]

    L += ["<!-- 站長觀點：想加本週看法，就把這行換成「### Simon 本週觀點」加上你的文字。 -->", "",
          "> 本週報由程式依公開資料自動整理，僅供參考，不構成投資建議。"]

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{today.isoformat()}.md"
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    if not a.no_snapshot:
        SNAP.mkdir(parents=True, exist_ok=True)
        (SNAP / f"{today.isoformat()}.json").write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    print(f"{out}  新增預售成交 {new_total} 筆、新聞 {len(heads)} 則、判讀 {len(takes)} 則")


if __name__ == "__main__":
    main()
