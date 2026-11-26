"""統計一致性測試（先 npm run build）：首頁、縣市頁、行政區頁、llms.txt 的中古屋單價都要等於 build.json。
用法：python3 tests/consistency.py"""
import json, re, sys
b = json.load(open('src/data/build.json'))
html = lambda p: open(f'dist{p}index.html', encoding='utf-8').read()
home, llms = html('/'), open('dist/llms.txt', encoding='utf-8').read()
errs = []
for r, url in (('city', '/region/hsinchu-city/'), ('county', '/region/hsinchu-county/')):
    v = str(b['regions'][r]['used'])
    if v not in home: errs.append(f'首頁缺 {r} {v}')
    if v not in html(url): errs.append(f'{url} 缺 {v}')
    if v not in llms: errs.append(f'llms.txt 缺 {r} {v}')
zb = str(b['districts']['zhubei']['used'])
for where, s in (('首頁', home), ('竹北頁', html('/region/hsinchu-county/zhubei/'))):
    if zb not in s: errs.append(f'{where} 缺竹北 {zb}')
print('\n'.join(errs) or 'consistency: ok'); sys.exit(1 if errs else 0)
