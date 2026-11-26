"""新竹市實價登錄的「鄉鎮市區」欄位只寫「新竹市」，用門牌地址對應到東區／北區／香山區。
對照表 data/hsinchu_city_roads.json 由新竹市民政處「新竹市門牌坐標資料」整理：
  r：路名 → 區（結尾有 ? 表示這條路跨區，要再看巷或門牌號）
  l：「路名|巷」→ 區
  n：「路名#奇偶」→ [[起始門牌, 區], ...]（同側門牌號由小到大，換區處記一筆）"""
import json, os, re
_T = json.load(open(os.path.join(os.path.dirname(__file__), "data", "hsinchu_city_roads.json"), encoding="utf-8"))
NAME = {"E": "東區", "N": "北區", "X": "香山區"}
_FW = str.maketrans("０１２３４５６７８９", "0123456789")
_RE = re.compile(r"^(.+?(?:路|街|大道)(?:[一二三四五六七八九十]+段)?)(?:(\d+)巷)?(?:(\d+)弄)?(\d+)?")

def city_district(addr: str):
    a = (addr or "").translate(_FW).replace("臺", "台")
    a = re.sub(r"^(新竹市)+", "", a)
    for k, v in NAME.items():           # 有些資料地址本身就寫了區
        if a.startswith(v):
            return v
    m = _RE.match(a)
    if not m:
        return None
    road, lane, _, no = m.groups()
    d = _T["r"].get(road)
    if not d:
        return None
    if not d.endswith("?"):
        return NAME[d]
    if lane and f"{road}|{lane}" in _T["l"]:
        return NAME[_T["l"][f"{road}|{lane}"]]
    n = int(lane or no or 0)
    runs = _T["n"].get(f"{road}#{n % 2}")
    if n and runs:
        cur = runs[0][1]
        for start, dd in runs:
            if n >= start:
                cur = dd
        return NAME[cur]
    return NAME[d[0]]
