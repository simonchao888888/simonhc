#!/usr/bin/env python3
"""
自動彙整新竹房市相關新聞標題（Google 新聞 RSS），輸出 src/data/news_feed.json。
只存標題、來源、日期與連結，不存內文；網站上顯示為「尚未判讀」的報導清單。
用法：python3 scripts/fetch_news.py
"""
import json, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

TOPICS = {
    "新竹房市": ["新竹 房市", "竹北 房價", "新竹 實價登錄", "新竹 預售屋"],
    "央行": ["央行 理監事會 房市", "央行 信用管制"],
    "房貸利率": ["房貸利率 五大銀行", "房貸 利率 銀行"],
    "青安貸款": ["青安3.0", "新青安"],
}
OUT = sys.argv[1] if len(sys.argv) > 1 else "src/data/news_feed.json"
TW = timezone(timedelta(hours=8))


def fetch(q):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": f"{q} when:14d", "hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"})
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse(xml_bytes, topic):
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
        out.append({"title": title, "link": it.findtext("link") or "", "source": source,
                    "date": d.strftime("%Y-%m-%d"), "ts": d.timestamp(), "topic": topic})
    return out


def main():
    items, seen = [], set()
    for topic, queries in TOPICS.items():
        for q in queries:
            try:
                got = parse(fetch(q), topic)
            except Exception as e:
                print(f"! {q}: {e}", file=sys.stderr)
                continue
            for x in got:
                key = x["title"][:40]
                if key in seen:
                    continue
                seen.add(key)
                items.append(x)
    if not items:
        sys.exit("沒有抓到任何新聞，保留舊檔。")
    items.sort(key=lambda x: x["ts"], reverse=True)
    for x in items:
        x.pop("ts")
    data = {"updated": datetime.now(TW).strftime("%Y-%m-%d %H:%M"), "items": items[:60]}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"✓ {len(data['items'])} 則 → {OUT}")


if __name__ == "__main__":
    main()
