#!/usr/bin/env python3
"""
依站長觀點自動產生新聞判讀草稿。

流程
1. 讀 src/data/news_feed.json（fetch_news.py 每天彙整的新聞標題），排除已經判讀過的。
2. 把「站長觀點設定檔」editorial/viewpoint.md、本站最新數字（實價登錄、租金、利率、信用管制）
   和候選新聞交給 Claude，請它：挑出對新竹買方最重要的幾則 → 用網路搜尋查證原文 →
   依站長觀點寫出 summary／take／action。
3. 結果加到 src/data/news.json 最前面，並寫出 PR 說明檔。GitHub Actions 會開 PR，
   站長審閱、修改後按 Merge 才會上線。

兩種模式
- 自動挑選：python3 scripts/draft_commentary.py --count 3
- 站長指定（GitHub Issue 或手動）：
  python3 scripts/draft_commentary.py --url <新聞網址或標題> --note "我的看法……"
  這時 take 會以站長寫的看法為主，AI 只負責查證事實、潤飾文字和補上新竹數字。

需要環境變數 ANTHROPIC_API_KEY；MODEL 可改用其他模型（預設 claude-sonnet-5-5）。
沒有金鑰時加 --dry-run 只輸出要送出的提示內容，方便檢查。
"""
import argparse, json, os, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / "src/data"
VIEWPOINT = ROOT / "editorial/viewpoint.md"
TW = timezone(timedelta(hours=8))
API = "https://api.anthropic.com/v1/messages"
CATS = ["新竹市場", "央行政策", "房貸利率", "貸款政策"]


def load(name):
    return json.load(open(DATA / name, encoding="utf-8"))


def site_context():
    """把網站目前的關鍵數字整理成一段文字，讓判讀可以引用新竹的實際數字。"""
    b, n = load("build.json"), load("news.json")
    try:
        rent = load("rent.json")
    except FileNotFoundError:
        rent = None
    seed = {d["id"]: d["name"] for d in load("seed.json")["districts"]}
    L = [f"實價登錄最新成交日：{b['meta']['latestDeal']}（單價皆為萬/坪、扣除車位）"]
    for k, nm in (("city", "新竹市"), ("county", "新竹縣")):
        r = b["regions"][k]
        L.append(f"- {nm}：中古屋中位數 {r.get('used')}（{r.get('usedN', '')} 筆），預售 {r.get('presale')}（{r.get('presaleN', '')} 筆）")
    for did, d in b["districts"].items():
        if d.get("tier") == "main" and d.get("used"):
            L.append(f"- {seed.get(did, did)}：中古 {d['used']}、預售 {d.get('presale')}（樣本 {d['n']}／{d.get('pn')}）")
    if rent:
        for k, nm in (("city", "新竹市"), ("county", "新竹縣")):
            r = rent["regions"][k]
            L.append(f"- {nm}租金：整戶月租中位數 {r['apt']} 元、每坪 {r['perPing']} 元、3 房 {r['rooms']['3']['rent']} 元")
    p = n["policyRate"]
    L.append(f"央行重貼現率 {p['discount']}%（{p['since']} 起，已連 {p['freezeCount']} 次不變），上次理監事會 {p['lastMeeting']}，下次 {p['nextMeeting']}")
    m = n["mortgageRates"][-1]
    L.append(f"五大銀行新承做房貸利率 {m[0]}：{m[1]}%，新青安占比 {m[2]}%")
    L.append("選擇性信用管制：" + "；".join(f"{c[0]} 成數 {c[1]}、寬限期 {c[2]}" for c in n["controls"]))
    return "\n".join(L)


def candidates(news, feed, limit=40, days=None):
    since = (datetime.now(TW) - timedelta(days=days)).strftime("%Y-%m-%d") if days else ""
    seen_t = {x["title"][:20] for x in news["news"]}
    seen_l = {s[1] for x in news["news"] for s in x.get("sources", [])}
    out = [x for x in feed.get("items", []) if x["title"][:20] not in seen_t and x["link"] not in seen_l
           and x.get("date", "")[:10] >= since]
    out.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return out[:limit]


SCHEMA = """請只輸出一個 JSON 陣列，放在 <json> 與 </json> 之間，每則格式：
{
 "id": "YYYY-MM-英文短代號",
 "date": "新聞日期 YYYY-MM-DD",
 "cat": "新竹市場｜央行政策｜房貸利率｜貸款政策 四選一",
 "title": "改寫過的標題（不要照抄原標題，30 字內）",
 "summary": "查證過的事實，2～3 句，用自己的話改寫，含關鍵數字與日期",
 "take": "站長觀點的判讀：這代表什麼、對新竹的意義，3～4 句",
 "action": "讀者可以做什麼，依族群分開寫，例如「首購族：……。換屋族：……。」",
 "sources": [["媒體或機關名稱", "實際查到的原文網址"]],
 "check": "給站長的審稿提醒：哪些數字或說法最需要再確認（一句話）"
}"""


def build_prompt(cands, count, url=None, note=None):
    viewpoint = VIEWPOINT.read_text(encoding="utf-8")
    system = (
        "你是「竹房知識站」站長 Simon 哥的編輯助理，負責替他起草新竹房市新聞判讀。"
        "你寫的是草稿，站長會審閱修改後才發布。\n\n"
        "## 站長觀點設定檔（最重要，判讀必須符合）\n" + viewpoint +
        "\n\n## 本站目前的新竹數字（可以引用）\n" + site_context() +
        "\n\n## 規則\n"
        "- 每則新聞都要先用 web_search 找到原文或官方資料，summary 只能寫查證到的事實；查不到就不要寫那則。\n"
        "- 用自己的話改寫，不要整段照抄新聞，引用原文不得超過 15 個字。\n"
        "- take 與 action 必須依照觀點設定檔的原則與語氣；不可預測具體漲跌幅、不可推薦特定建案。\n"
        "- 一律使用繁體中文與台灣用語。\n\n" + SCHEMA
    )
    if url or note:
        user = (f"站長指定要判讀這則新聞：{url or '（未提供網址）'}\n\n"
                f"站長自己的看法如下，take 必須以這段為主軸，只能潤飾文字、補上查證到的事實和本站數字，不可改變他的立場：\n{note or '（站長沒有寫看法，請依觀點設定檔判讀）'}\n\n"
                "請輸出 1 則。")
    else:
        lines = [f"{i + 1}. [{x['date']}｜{x['topic']}｜{x['source']}] {x['title']}  {x['link']}" for i, x in enumerate(cands)]
        user = (f"以下是最近彙整的新聞標題。請挑出對「新竹縣市買房、換屋、房東」最重要的 {count} 則"
                "（同一事件只挑一則；與新竹無關、純廣告、建案置入的不要挑），查證後寫成判讀草稿。\n\n" + "\n".join(lines))
    return system, user


def call_claude(system, user):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("沒有設定 ANTHROPIC_API_KEY")
    body = {
        "model": os.environ.get("MODEL", "claude-sonnet-5-5"),
        "max_tokens": 8000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 12,
                   "user_location": {"type": "approximate", "country": "TW", "timezone": "Asia/Taipei"}}],
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={
        "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        res = json.load(r)
    return "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")


def parse(text):
    m = re.search(r"<json>(.*?)</json>", text, re.S)
    raw = m.group(1) if m else text[text.find("["): text.rfind("]") + 1]
    items = json.loads(raw)
    ok = []
    for x in items if isinstance(items, list) else [items]:
        if not all(x.get(k) for k in ("id", "date", "title", "summary", "take", "action", "sources")):
            continue
        if x.get("cat") not in CATS:
            x["cat"] = "新竹市場"
        x["sources"] = [s for s in x["sources"] if isinstance(s, list) and len(s) == 2 and str(s[1]).startswith("http")]
        if x["sources"]:
            ok.append(x)
    return ok


def merge(items, pr_body):
    n = load("news.json")
    ids = {x["id"] for x in n["news"]}
    added = []
    for x in items:
        while x["id"] in ids:
            x["id"] += "-b"
        ids.add(x["id"])
        check = x.pop("check", "")
        added.append((x, check))
    n["news"] = [x for x, _ in added] + n["news"]
    n["news"].sort(key=lambda x: x["date"], reverse=True)
    n["updated"] = datetime.now(TW).strftime("%Y-%m-%d")
    (DATA / "news.json").write_text(json.dumps(n, ensure_ascii=False, indent=1), encoding="utf-8")

    L = ["## 新聞判讀草稿（請站長審閱）", "",
         "以下內容由 AI 依 `editorial/viewpoint.md` 起草，**還沒有上線**。",
         "請到「Files changed」直接修改 `src/data/news.json` 的文字，確認沒問題後按 **Merge** 就會發布。", ""]
    for x, check in added:
        L += [f"### {x['title']}", f"- 分類：{x['cat']}｜日期：{x['date']}",
              f"- 事實：{x['summary']}", f"- 判讀：{x['take']}", f"- 建議：{x['action']}",
              "- 來源：" + "、".join(f"[{s[0]}]({s[1]})" for s in x["sources"]),
              f"- ⚠️ 審稿提醒：{check or '請核對數字與日期'}", ""]
    L += ["---", "審稿清單：", "- [ ] 數字、日期與原文一致", "- [ ] 判讀是我會說的話", "- [ ] 沒有推薦特定建案或預測漲跌幅"]
    Path(pr_body).write_text("\n".join(L), encoding="utf-8")
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--days", type=int, help="只挑最近幾天的新聞（週報流程用 7 或 14）")
    ap.add_argument("--url")
    ap.add_argument("--note")
    ap.add_argument("--note-file")
    ap.add_argument("--pr-body", default="commentary_pr.md")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--response-file", help="測試用：用存好的模型回應代替呼叫 API")
    a = ap.parse_args()
    note = a.note or (Path(a.note_file).read_text(encoding="utf-8") if a.note_file else None)

    cands = [] if (a.url or note) else candidates(load("news.json"), load("news_feed.json"), days=a.days)
    if not (a.url or note) and not cands:
        print("沒有新的新聞可判讀")
        return
    system, user = build_prompt(cands, a.count, a.url, note)
    if a.dry_run:
        print(system, "\n\n=====\n\n", user)
        return
    text = Path(a.response_file).read_text(encoding="utf-8") if a.response_file else call_claude(system, user)
    items = parse(text)
    if not items:
        sys.exit("模型沒有產出可用的判讀（可能是查證不到原文）")
    added = merge(items, a.pr_body)
    print(f"新增 {len(added)} 則判讀草稿：" + "、".join(x["title"] for x, _ in added))


if __name__ == "__main__":
    main()
