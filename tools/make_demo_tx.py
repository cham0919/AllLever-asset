import openpyxl, random, sys
from openpyxl.styles import Font, PatternFill
src, out = sys.argv[1], sys.argv[2]
random.seed(7)
wb = openpyxl.load_workbook(src)
def h36(s):
    h = 5381
    for ch in s: h = ((h * 33) & 0xFFFFFFFF) ^ ord(ch)
    d = '0123456789abcdefghijklmnopqrstuvwxyz'; o = ''
    while True:
        o = d[h % 36] + o; h //= 36
        if not h: break
    return o
rid = lambda k, n, s, m: 'R' + h36('|'.join([k, n, s, m]))
SUBS = {"생활비": "식비, 카페, 장보기, 교통, 쇼핑, 생활용품, 경조사", "주거비": "월세, 대출이자", "통신": "휴대폰, 인터넷",
        "의료비": "병원, 약국", "기타": "여행, 선물, 교육", "기타수입": "이자, 환급, 중고판매"}
FIX = {"월급1": (25, ''), "월급2": (10, ''), "주거비": (21, '대출이자'), "용돈": (1, ''), "관리비": (20, ''), "통신": (5, '휴대폰'), "할부금": (15, '')}
LIFE = [("식비", 0.36, ["점심", "배달", "외식", "편의점"]), ("카페", 0.08, ["커피", "카페"]), ("장보기", 0.28, ["마트 장보기", "온라인 장보기"]),
        ("교통", 0.1, ["주유", "택시", "교통카드"]), ("쇼핑", 0.12, ["옷", "온라인 쇼핑"]), ("생활용품", 0.06, ["생활용품"])]
PAYS = ["신한카드", "현대카드", "체크카드", "신한카드", "현금"]
H = 14
def split(total, n):
    if total <= 0 or n <= 0: return []
    w = [random.uniform(.4, 1.6) for _ in range(n)]; s = sum(w)
    a = [max(100, round(total * x / s, -2)) for x in w]; a[-1] += total - sum(a)
    return [x for x in a if x > 0] if a[-1] > 0 else split(total, n - 1)
for m in range(1, 13):
    ws = wb[f"{m}월"]
    for i, hd in enumerate(["세부분류", "월 예산"]): ws.cell(H, 5 + i, hd)
    for i, hd in enumerate(["일", "구분", "항목", "세부분류", "금액", "결제수단", "메모", "ID"]): ws.cell(H, 8 + i, hd)
    for i, hd in enumerate(["일", "구분", "항목", "세부분류", "금액", "결제수단", "메모"]): ws.cell(H, 17 + i, hd)
    for c in list(range(5, 7)) + list(range(8, 16)) + list(range(17, 24)):
        ws.cell(H, c).font = Font(bold=True); ws.cell(H, c).fill = PatternFill("solid", fgColor="F3F4F6")
    items = []; r = H + 1
    while True:
        k = ws.cell(r, 1).value
        if k is None or str(k).startswith('▲'): break
        items.append((r, k, ws.cell(r, 2).value, ws.cell(r, 3).value)); r += 1
    tx, reps = [], []
    for r, k, n, a in items:
        ws.cell(r, 5, SUBS.get(n)); 
        if n == "생활비": ws.cell(r, 6, 1500000)
        if not a: continue
        a = int(a)
        if n in FIX:
            d, sub = FIX[n]; pay = '' if k == '수입' else '자동이체'
            tx.append([d, k, n, sub, a, pay, '반복', rid(k, n, sub, '')]); reps.append([d, k, n, sub, a, pay, ''])
        elif n == "생활비":
            for sub, w, memos in LIFE:
                part = round(a * w, -2) if sub != "생활용품" else a - sum(round(a * x, -2) for s2, x, _ in LIFE if s2 != "생활용품")
                cnt = max(1, int(part / (25000 if sub != '카페' else 6000)))
                for v in split(part, min(cnt, 14)):
                    tx.append([random.randint(1, 28), k, n, sub, v, random.choice(PAYS), random.choice(memos), None])
        else:
            subs = [s.strip() for s in (SUBS.get(n) or '').split(',') if s.strip()]
            for v in split(a, random.randint(1, 3)):
                tx.append([random.randint(1, 28), k, n, random.choice(subs) if subs else '', v, random.choice(PAYS), '', None])
    tx.sort(key=lambda t: t[0])
    for i, t in enumerate(tx):
        if not t[7]: t[7] = f"D{m}-{i}"
        for j, v in enumerate(t): ws.cell(H + 1 + i, 8 + j, v if v != '' else None)
    for i, rp in enumerate(reps):
        for j, v in enumerate(rp): ws.cell(H + 1 + i, 17 + j, v if v != '' else None)
    print(m, len(tx), len(reps))
wb.save(out)
