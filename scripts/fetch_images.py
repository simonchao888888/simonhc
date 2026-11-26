"""下載 scripts/data/image_sources.json 列出的 Wikimedia Commons 圖片，
轉成多種寬度的 AVIF／WebP，並寫出圖片資料庫 src/data/images.json（作者、授權、原始網址、拍攝日期）。

只接受可商用、可改作的授權（CC0、公眾領域、CC BY、CC BY-SA）。不符合的檔案會被略過並記錄在 skipped。
已下載且來源未變的圖片不會重抓。在 GitHub Actions 執行（本機沙盒無法連到 Wikimedia）。
"""
import html, io, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/data/image_sources.json"
OUT_DIR = ROOT / "public/img"
REG = ROOT / "src/data/images.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "simonhc.com image fetcher (https://simonhc.com/; contact via site)"}
OK_LICENSE = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)
WIDTHS = [480, 960, 1600]
HERO_WIDTHS = [960, 1600, 2400]


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print("  retry", e, file=sys.stderr)
            time.sleep(5 * (i + 1))


def info(fname):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "titles": "File:" + fname, "prop": "imageinfo",
                                "iiprop": "url|size|extmetadata", "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|DateTimeOriginal|Credit"})
    p = next(iter(json.loads(get(f"{API}?{q}"))["query"]["pages"].values()))
    if "imageinfo" not in p:
        return None
    i = p["imageinfo"][0]
    m = {k: v.get("value", "") for k, v in (i.get("extmetadata") or {}).items()}
    strip = lambda s: html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()
    date = strip(m.get("DateTimeOriginal"))
    d = re.search(r"(\d{4})[-:](\d{2})[-:](\d{2})", date)
    y = re.search(r"\b(19|20)\d{2}\b", date)
    return {"url": i["url"], "page": i["descriptionurl"], "w": i["width"], "h": i["height"],
            "author": strip(m.get("Artist")) or "未具名", "license": strip(m.get("LicenseShortName")),
            "licenseUrl": m.get("LicenseUrl", ""), "date": "-".join(d.groups()) if d else (y.group(0) if y else None)}


def main():
    src = json.loads(SRC.read_text())["images"]
    old = {x["id"]: x for x in json.loads(REG.read_text())["images"]} if REG.exists() else {}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reg, skipped = [], []
    for s in src:
        meta = info(s["file"])
        if not meta:
            skipped.append([s["id"], "找不到檔案"]); continue
        if not OK_LICENSE.match(meta["license"]):
            skipped.append([s["id"], f"授權不符：{meta['license']}"]); continue
        widths = HERO_WIDTHS if s.get("hero") else WIDTHS
        prev = old.get(s["id"])
        have = prev and prev.get("source") == meta["page"] and all((OUT_DIR / f"{s['id']}-{w}.webp").exists() for w in prev["widths"])
        if have:
            outw = prev["widths"]; ratio = prev["ratio"]
        else:
            print("下載", s["id"], meta["license"])
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(get(meta["url"])))).convert("RGB")
            ratio = round(im.width / im.height, 4)
            outw = []
            for w in widths:
                if w > im.width:
                    continue
                r = im.resize((w, round(w / ratio)), Image.LANCZOS)
                r.save(OUT_DIR / f"{s['id']}-{w}.webp", "WEBP", quality=72, method=6)
                try:
                    r.save(OUT_DIR / f"{s['id']}-{w}.avif", "AVIF", quality=55, speed=6)
                except Exception as e:  # noqa: BLE001
                    print("  AVIF 失敗", e, file=sys.stderr)
                outw.append(w)
            time.sleep(1)
        reg.append({
            "id": s["id"], "title": s["title"], "place": s.get("place"), "dist": s.get("dist"), "area": s.get("area"),
            "cat": s["cat"], "author": meta["author"], "source": meta["page"], "origin": "Wikimedia Commons",
            "license": meta["license"], "licenseUrl": meta["licenseUrl"], "date": meta["date"],
            "real": True, "illustration": False, "limits": "依授權條款標示作者與授權；CC BY-SA 改作須同授權",
            "alt": s.get("alt") or s["title"], "w": meta["w"], "h": meta["h"], "ratio": ratio,
            "pos": s.get("pos", "50% 50%"), "widths": outw, "path": f"/img/{s['id']}",
            "avif": all((OUT_DIR / f"{s['id']}-{w}.avif").exists() for w in outw),
        })
    REG.write_text(json.dumps({"updated": time.strftime("%Y-%m-%d"), "images": reg, "skipped": skipped}, ensure_ascii=False, indent=1))
    print(f"完成 {len(reg)} 張，略過 {len(skipped)}：{skipped}")


if __name__ == "__main__":
    main()
