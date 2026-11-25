#!/usr/bin/env python3
"""
每月建案拆解：從實價登錄預售資料，挑出最近 90 天成交最多的新竹建案，
自動產生一篇「建案拆解」文章草稿到 src/content/guide/。

文章只放計算出來的數字與固定的判讀框架；站長的觀點請在 PR 裡補在「Simon 怎麼看」段落。

用法：python3 scripts/case_study.py [--name 建案名稱] [--out-dir src/content/guide]
"""
import argparse, hashlib, json, statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "src/data"
ALIAS = {"森?": "森藴"}
RNAME = {"city": "新竹市", "county": "新竹縣"}


def med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def f1(x):
    return "—" if x is None else f"{x:.1f}"


def money(x):
    return "—" if x is None else f"{x:,.0f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name")
    ap.add_argument("--out-dir", default=str(DATA.parent / "content/guide"))
    a = ap.parse_args()

    deals = json.load(open(DATA / "presale_deals.json", encoding="utf-8"))
    build = json.load(open(DATA / "build.json", encoding="utf-8"))
    seed = json.load(open(DATA / "seed.json", encoding="utf-8"))
    featured = json.load(open(DATA / "presale_projects.json", encoding="utf-8"))
    featured = featured.get("featured", []) if isinstance(featured, dict) else featured
    latest = max(d["d"] for v in deals.values() for d in v)
    since = (date.fromisoformat(latest) - timedelta(days=90)).isoformat()

    def recent(v):
        return [d for d in v if d["d"] >= since and not d.get("cancel")]

    if a.name:
        key = next(k for k in deals if ALIAS.get(k.split("|")[2], k.split("|")[2]) == a.name)
    else:
        # 已經寫過的建案不重複
        done = {p.stem.split("-")[1] for p in Path(a.out_dir).glob("case-*.md")}
        ranked = sorted(deals, key=lambda k: len(recent(deals[k])), reverse=True)
        key = next((k for k in ranked
                    if hashlib.md5(k.encode()).hexdigest()[:6] not in done and len(recent(deals[k])) >= 10), None)
        if not key:
            print("最近 90 天沒有成交 10 筆以上、且還沒寫過的建案，本月略過")
            return

    r, dist, raw_name = key.split("|")
    name = ALIAS.get(raw_name, raw_name)
    all_live = [d for d in deals[key] if not d.get("cancel")]
    rec = recent(deals[key])
    cancels = len(deals[key]) - len(all_live)
    ups = [d["up"] for d in all_live if d.get("up")]

    proj = next((p for p in build["projects"] if p["name"] == raw_name and p["r"] == r), {})
    fid = next((f.get("id") for f in featured if f.get("name") == name), None)
    pid = fid or "p" + hashlib.md5(f"{r}|{proj.get('dist', dist)}|{raw_name}".encode()).hexdigest()[:8]
    dname = proj.get("dist") or dist
    did = next((s["id"] for s in seed["districts"] if s["name"] == dname), None)
    dstat = build["districts"].get(did, {}) if did else {}
    rstat = build["regions"][r]
    used = dstat.get("used") or rstat.get("used")
    used_label = dname if dstat.get("used") else RNAME[r]

    # 樓層：上三分之一 vs 下三分之一
    fl = sorted([d for d in all_live if d.get("fn") and d.get("up")], key=lambda d: d["fn"])
    third = max(1, len(fl) // 3)
    low, high = med([d["up"] for d in fl[:third]]), med([d["up"] for d in fl[-third:]])
    # 房型
    rooms = {}
    for d in all_live:
        k = (d.get("rooms") or "").split("房")[0]
        if k.isdigit():
            rooms.setdefault(k, []).append(d)
    # 車位
    parks = [p for d in all_live for p in d.get("parks", []) if p[1]]
    ptype = {}
    for p in parks:
        ptype.setdefault(p[0] or "未註明", []).append(p[1])
    unsplit = sum(1 for d in all_live if d.get("ptype") and not d.get("pprice"))
    # 價格走勢：最早 3 個月 vs 最近 3 個月
    months = sorted({d["d"][:7] for d in all_live})
    first = med([d["up"] for d in all_live if d["d"][:7] in months[:3] and d.get("up")])
    last = med([d["up"] for d in all_live if d["d"][:7] in months[-3:] and d.get("up")])

    um = med(ups)
    prem = (um / used - 1) * 100 if um and used else None
    slug = f"case-{hashlib.md5(key.encode()).hexdigest()[:6]}-{latest[:7]}"
    lines = [
        "---",
        f"title: 建案拆解：{name}（{dname}）",
        f"description: 用實價登錄逐戶看{name}：{len(all_live)} 筆成交、單價中位數 {f1(um)} 萬/坪，樓層價差、房型總價與車位行情一次看。",
        "category: 市場分析",
        "tags: [預售屋, 實價登錄與房價判讀]",
        f"pubDate: {date.today().isoformat()}",
        "order: 50",
        "---",
        "",
        f"這篇是每月一次的「建案拆解」。資料截至 {latest}，全部來自內政部實價登錄，"
        f"單價已扣除車位價格與車位坪數。逐戶明細請看[{name} 建案頁](/presale/{pid}/)。",
        "",
        "### 基本資料",
        "",
        "| 項目 | 內容 |",
        "|---|---|",
        f"| 區域 | {RNAME[r]}{'' if dname == RNAME[r] else dname} |",
        f"| 起造人 | {(proj.get('dev') or '—').split(' 負責人')[0]} |",
        f"| 總戶數（建照登記） | {proj.get('units') or '—'} |",
        f"| 已揭露成交 | {len(all_live)} 筆（最近 90 天 {len(rec)} 筆）{f'，另有 {cancels} 筆解約' if cancels else ''} |",
        f"| 單價中位數 | {f1(um)} 萬/坪（{f1(min(ups) if ups else None)}～{f1(max(ups) if ups else None)}） |",
        f"| 總價中位數 | {money(med([d['total'] for d in all_live]))} 萬 |",
        "",
        "### 1. 跟周邊中古屋比，貴多少？",
        "",
        f"{used_label}中古屋單價中位數約 {f1(used)} 萬/坪，這個建案的單價"
        + (f"高出約 **{prem:.0f}%**。" if prem is not None else "暫時無法比較。"),
        "預售和中古的價差，就是你為「新」「公設」「建商品牌」多付的錢。價差越大，越要問自己：這些東西值不值這個溢價。",
        "",
        "### 2. 樓層價差",
        "",
        f"低樓層（下三分之一）單價中位數 {f1(low)} 萬，高樓層（上三分之一）{f1(high)} 萬，"
        + (f"每坪差約 {high - low:.1f} 萬。" if low and high else "")
        + "新竹風大，高樓層的景觀和採光要和風壓、門窗等級一起看。",
        "",
        "### 3. 房型與總價",
        "",
        "| 房型 | 筆數 | 單價中位數（萬/坪） | 總價中位數（萬） | 扣車位後坪數 |",
        "|---|---|---|---|---|",
    ]
    for k in sorted(rooms, key=int):
        xs = rooms[k]
        lines.append(f"| {k} 房 | {len(xs)} | {f1(med([d['up'] for d in xs]))} | {money(med([d['total'] for d in xs]))} | {f1(med([d['net'] for d in xs]))} |")
    lines += ["", "### 4. 車位", ""]
    if ptype:
        lines += ["| 車位類型 | 筆數 | 價格中位數（萬） |", "|---|---|---|"]
        lines += [f"| {t} | {len(v)} | {money(med(v))} |" for t, v in sorted(ptype.items(), key=lambda x: -len(x[1]))]
    if unsplit:
        lines.append(f"\n另有 {unsplit} 筆車位價格沒有拆開登記，單價可能被低估，比較時要注意。")
    lines += [
        "",
        "### 5. 開賣至今的價格變化",
        "",
        (f"最早三個月成交單價中位數 {f1(first)} 萬，最近三個月 {f1(last)} 萬"
         + (f"，變化約 {((last / first) - 1) * 100:+.1f}%。" if first and last else "。")
         if len(months) >= 6 else
         f"這個建案的成交集中在 {months[0]} 到 {months[-1]}，揭露時間還短，價格趨勢要再觀察幾期。")
        + "如果越賣越貴，代表建商有調價；越賣越便宜或解約增加，代表去化壓力在變大。",
        "",
        "<!-- 站長觀點：在 PR 裡把下面這段註解換成「### Simon 怎麼看」加上你的看法，例如這個價格適合誰、最大的風險、怎麼談價。沒填就不會顯示。 -->",
        "",
        "### 資料來源",
        "",
        "- [內政部不動產成交案件實際資訊（實價登錄）](https://lvr.land.moi.gov.tw/)",
        "",
        "> 本文數字由程式自動計算，僅供參考，不構成投資建議。",
    ]
    Path(a.out_dir).mkdir(parents=True, exist_ok=True)
    out = Path(a.out_dir) / f"{slug}.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
