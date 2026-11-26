#!/usr/bin/env python3
"""下載內政部實價登錄季檔與 10 天批次，只留新竹市（o_）與新竹縣（j_）檔案，存成 raw/<代號>.zip。
用於資料核對與建物移轉棟數統計。用法：python3 scripts/fetch_raw.py --from 112S1 --out raw"""
import argparse, io, os, sys, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from build_data import load_zip_bytes, recent_batches

def seasons_from(start):
    y, q = int(start[:3]), int(start[-1])
    from datetime import date
    t = date.today(); ty, tq = t.year - 1911, (t.month - 1) // 3 + 1
    out = []
    while (y, q) <= (ty, tq):
        out.append(f"{y}S{q}"); q += 1
        if q == 5: y, q = y + 1, 1
    return out

ap = argparse.ArgumentParser(); ap.add_argument("--from", dest="start", default="112S1"); ap.add_argument("--out", default="raw")
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
for s in seasons_from(a.start) + recent_batches():
    z = load_zip_bytes(s)
    if not z:
        print(f"  - {s} 無資料"); continue
    src = zipfile.ZipFile(io.BytesIO(z)); buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as dst:
        names = [n for n in src.namelist() if os.path.basename(n).lower().startswith(("o_", "j_"))]
        for n in names: dst.writestr(os.path.basename(n), src.read(n))
    open(os.path.join(a.out, f"{s}.zip"), "wb").write(buf.getvalue())
    print(f"  ✓ {s}: {len(names)} 檔")
