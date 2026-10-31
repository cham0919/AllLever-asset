import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else "template.xlsx"
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import PieChart, BarChart, LineChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.series import SeriesLabel
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.utils import get_column_letter as L

FONT = "맑은 고딕"
INK = "1F2937"; SUB = "6B7280"; LINE = "E5E7EB"; HEAD = "F3F4F6"; ACC = "2563EB"; INPUT = "FFFBEB"
WON = '#,##0;-#,##0;"-"'
PCT = '0.0%;-0.0%;"-"'
thin = Side(style="thin", color=LINE)
BOX = Border(top=thin, bottom=thin, left=thin, right=thin)

def f(bold=False, size=10, color=INK):
    return Font(name=FONT, bold=bold, size=size, color=color)

def head(c):
    c.font = f(True, 10); c.fill = PatternFill("solid", fgColor=HEAD)
    c.alignment = Alignment(horizontal="center", vertical="center"); c.border = BOX

def body(c, fmt=None, inp=False, bold=False, color=INK):
    c.font = f(bold, 10, "0000FF" if inp else color); c.border = BOX
    if inp: c.fill = PatternFill("solid", fgColor=INPUT)
    if fmt: c.number_format = fmt

def title(ws, text, sub=None):
    ws["A1"] = text; ws["A1"].font = f(True, 16)
    if sub: ws["A2"] = sub; ws["A2"].font = f(False, 9, SUB)
    ws.sheet_view.showGridLines = False

wb = Workbook()

# ───────────────── 설정 ─────────────────
st = wb.active; st.title = "설정"
title(st, "설정 · 항목 관리", "파란 글씨·노란 칸이 직접 입력하는 칸입니다. 항목을 추가·삭제하면 각 시트의 드롭다운 목록에 반영됩니다.")
st["A4"] = "기준 연도"; body(st["A4"], bold=True)
st["B4"] = 2026; body(st["B4"], "0", inp=True)
st["A5"] = "전년 12월 말 부채"; body(st["A5"], bold=True)
body(st["B5"], WON, inp=True)
st["C5"] = "← 1월 대출 상환액 계산용 (작년 12월 자산관리 시트의 부채 합계). 비워 두면 1월 상환액은 0"; st["C5"].font = f(False, 9, SUB)

BUDGET = [("수입", "월급"), ("수입", "기타수입"),
          ("고정비", "주거비"), ("고정비", "용돈"), ("고정비", "관리비"), ("고정비", "통신"),
          ("변동비", "할부금"), ("변동비", "생활비"), ("변동비", "초과금"), ("변동비", "의료비"), ("변동비", "기타")]
st["A6"] = "가계부 항목"; st["A6"].font = f(True, 12)
for i, h in enumerate(["구분(1차)", "항목(2차)"]): head(st.cell(7, 1 + i, h))
for r, (a, b) in enumerate(BUDGET, start=8):
    body(st.cell(r, 1, a), inp=True); body(st.cell(r, 2, b), inp=True)
BUD_END = 8 + len(BUDGET) + 15   # 여유 칸 포함 목록 범위
for r in range(8 + len(BUDGET), BUD_END + 1):
    body(st.cell(r, 1), inp=True); body(st.cell(r, 2), inp=True)

ASSETS = [("유동자산", "저축", "입출금통장"), ("유동자산", "저축", "예적금"), ("유동자산", "저축", "비상금"),
          ("유동자산", "투자", "주식계좌1"), ("유동자산", "투자", "주식계좌2"), ("유동자산", "코인", "코인"),
          ("비유동자산", "부동산", "집"), ("비유동자산", "퇴직금", "퇴직연금1"), ("비유동자산", "퇴직금", "퇴직연금2"),
          ("비유동자산", "청약", "청약1"), ("비유동자산", "청약", "청약2"),
          ("부채", "대출", "주택담보대출"), ("부채", "대출", "신용대출"), ("부채", "대출", "기타대출")]
st["E6"] = "자산 분류"; st["E6"].font = f(True, 12)
for i, h in enumerate(["대분류", "중분류", "소분류"]): head(st.cell(7, 5 + i, h))
for r, row in enumerate(ASSETS, start=8):
    for j, v in enumerate(row): body(st.cell(r, 5 + j, v), inp=True)
AS_END = 8 + len(ASSETS) + 15
for r in range(8 + len(ASSETS), AS_END + 1):
    for j in range(3): body(st.cell(r, 5 + j), inp=True)

st["I6"] = "사용 방법"; st["I6"].font = f(True, 12)
guide = ["1) 매달 'N월' 시트 오른쪽 '거래 내역'에 날짜(일)·구분·항목·금액을 적으면 왼쪽 요약·달력(날짜별 지출)·구분별 금액이 자동으로 계산됩니다.",
         "   월 예산·반복 거래도 달마다 그 시트에 있어요. 세부분류 목록은 숨긴 H열에 있어요(앱에서 관리).",
         "2) 가계부 항목 추가: 해당 월 시트의 '▲ 이 행 위에 삽입' 행 위에 행을 넣고 구분/항목/금액 입력.",
         "   항목 삭제: 그 행을 통째로 삭제. 구분은 반드시 수입·고정비·변동비 중 하나.",
         "3) 자산 항목 추가/삭제도 '자산관리' 시트의 '▲ 이 행 위에 삽입' 행 기준으로 동일하게 합니다.",
         "   대분류는 반드시 유동자산·비유동자산·부채 중 하나.",
         "4) 부채는 양수로 입력하세요 (예: 대출 잔액 300,000,000).",
         "   저축은 두 가지로 나눠 관리합니다: 일반 저축 = 수입 − 지출, 대출상환 저축 = 자산관리 시트 부채 합계가 전월보다 줄어든 만큼(자동).",
         "5) 이 설정 시트의 목록은 드롭다운 후보입니다. 새 항목은 여기에도 적어두면 편합니다.",
         "6) 자산 묶음은 중분류 기준입니다: 투자·퇴직금·코인 = 금융투자, 저축·청약 = 현금, 부동산 = 부동산. 소분류 이름은 자유롭게 바꾸세요.",
         "7) 앱은 시트 이름(1월~12월, 자산관리)과 '구분'/'대분류' 머리글을 기준으로 읽습니다. 이름은 바꾸지 마세요."]
for i, g in enumerate(guide): st.cell(7 + i, 9, g).font = f(False, 10, SUB)
for col, w in zip("ABCDEFGHI", [14, 14, 3, 3, 12, 12, 14, 3, 90]): st.column_dimensions[col].width = w

# ───────────────── 월별 가계부 ─────────────────
EX = {  # 예시 값 (1~3월)
    1: [4200000, 3300000, 100000, 1200000, 600000, 250000, 120000, 300000, 1500000, 200000, 50000, 150000],
    2: [4200000, 3300000, 0, 1200000, 600000, 280000, 120000, 300000, 1650000, 0, 120000, 90000],
    3: [4200000, 3300000, 1500000, 1200000, 600000, 230000, 120000, 300000, 1400000, 350000, 0, 200000],
}
HDR = 8; A0 = HDR + 1; A_END = A0 + len(ASSETS)   # 자산관리: 1~7행 제목 + 1월 대비 요약
S0 = A_END + 2; DEBT_ROW = S0 + 4                  # 요약 블록 머리글 / 부채 합계 행
# ── 월 시트 배치 ──
# 왼쪽(A~G) 위→아래: 요약(4~8행) · 달력(10~23행) · 수입 배분 그래프(25행~) · 항목별 표(42행 머리글)
# 오른쪽(I~P) 위→아래: 반복 거래(4행 머리글, 20줄) · 거래 내역(27행 머리글)
CAL_T = 10; CAL_H = 11; CAL0 = 12            # 달력 제목 / 요일 / 첫 주
CHART_ROW = 25                               # 수입 배분 그래프 (달력 아래)
T0 = 43                                      # 항목별 표 첫 행 (머리글 42행)
T_END = T0 + len(BUDGET)                     # 마커 행 (범위에 포함 → 위에 삽입 시 범위 자동 확장)
RC = 9                                       # 오른쪽 블록 시작 열 (I)
REP_H0 = 4; REP_CAP = 20                     # 반복 거래 머리글 행 / 칸 수
TX_H0 = REP_H0 + REP_CAP + 3                 # 거래 내역 머리글 행 (27)
TX0 = TX_H0 + 1; TX_END = 2000; TX_FMT = 150
TX_H = ["일", "구분", "항목", "세부분류", "금액", "결제수단", "메모", "ID"]
REP_H = ["일", "구분", "항목", "세부분류", "금액", "결제수단", "메모"]
cl = lambda k: L(RC + k)                     # 오른쪽 블록 k번째 열 글자
TXR = lambda k: f"${cl(k)}${TX0}:${cl(k)}${TX_END}"   # 거래 내역 k열 범위
SUBS = {"생활비": "식비, 카페, 장보기, 교통, 쇼핑, 생활용품, 경조사", "주거비": "월세, 대출이자", "통신": "휴대폰, 인터넷",
        "의료비": "병원, 약국", "기타": "여행, 선물, 교육", "기타수입": "이자, 환급, 중고판매"}
CALAMT = '#,##0;-#,##0;""'
WEEK = ["일", "월", "화", "수", "목", "금", "토"]
SUN = "DC2626"; SAT = "2563EB"; CALBG = "F9FAFB"; TODAY = "DBEAFE"
for m in range(1, 13):
    ws = wb.create_sheet(f"{m}월")
    title(ws, None)
    ws["A1"] = f'=설정!$B$4&"년 {m}월 가계부"'; ws["A1"].font = f(True, 16)
    ws["A2"] = "오른쪽 '거래 내역'에 적으면 요약·달력·구분별 금액이 자동으로 계산돼요. 저축 합계 = 일반 저축(수입 − 지출) + 대출상환 저축(자산관리 시트 부채 감소분)"; ws["A2"].font = f(False, 9, SUB)
    rngA = f"$A${T0}:$A${T_END}"; rngC = f"$C${T0}:$C${T_END}"; rngF = f"$E${T0}:$E${T_END}"

    # ── 달력 보조값 (숨김 서식): 연도 · 날짜 수 · 1일 요일 칸 ──
    ws.cell(CAL_T, 1, "달력 · 날짜별 지출").font = f(True, 12)
    ws.cell(CAL_T, 3, "수입은 빼고 지출만 더해요").font = f(False, 9, SUB)
    for col, fm in ((5, "=설정!$B$4"), (6, f"=DAY(EOMONTH(DATE($E${CAL_T},{m},1),0))"), (7, f"=WEEKDAY(DATE($E${CAL_T},{m},1))-1")):
        c = ws.cell(CAL_T, col, fm); c.number_format = ";;;"; c.font = f(False, 8, SUB)
    YR, ND, OFF = f"$E${CAL_T}", f"$F${CAL_T}", f"$G${CAL_T}"

    # ── 요약 (4~8행) ──
    ws["A4"] = "요약"; ws["A4"].font = f(True, 12)
    cur = f"자산관리!{L(3 + m)}"; prv = f"자산관리!{L(2 + m)}"
    cur_has = f"COUNT({cur}${A0}:{L(3 + m)}${A_END})>0"
    if m == 1:   # 전월 = 작년 12월 → 설정 시트 입력값
        prev_has, prev_debt = "설정!$B$5<>\"\"", "설정!$B$5"
    else:
        prev_has, prev_debt = f"COUNT({prv}${A0}:{L(2 + m)}${A_END})>0", f"{prv}${DEBT_ROW}"
    REPAY = f"=IF(AND({cur_has},{prev_has}),MAX(0,{prev_debt}-{cur}${DEBT_ROW}),0)"
    TODAYN = f"IF(AND(YEAR(TODAY())={YR},MONTH(TODAY())={m}),DAY(TODAY()),IF(DATE({YR},{m},1)>TODAY(),0,{ND}))"
    SUMS = [  # (라벨, 수식, 서식, 색)
        [("총 수입", f'=SUMIF({rngA},"수입",{rngC})', WON, INK), ("고정비", f'=SUMIF({rngA},"고정비",{rngC})', WON, INK),
         ("변동비", f'=SUMIF({rngA},"변동비",{rngC})', WON, INK), ("총 지출", "=B6+C6", WON, INK),
         ("일반 저축", "=A6-D6", WON, INK), ("대출상환 저축", REPAY, WON, INK), ("저축 합계", "=E6+F6", WON, ACC)],
        [("저축률", "=IF(A6=0,0,G6/A6)", PCT, ACC), ("지출 예산", f'=SUMIF({rngA},"<>수입",{rngF})', WON, INK),
         ("예산 남은 금액", '=IF(B8=0,"",B8-D6)', WON, INK), ("하루 평균 지출", f"=IF({TODAYN}=0,0,D6/{TODAYN})", WON, INK)],
    ]
    for k, line in enumerate(SUMS):
        r = 5 + k * 2
        for j, (lab, fm, fmt, color) in enumerate(line):
            c = ws.cell(r, 1 + j, lab); c.font = f(False, 9, SUB); c.fill = PatternFill("solid", fgColor=HEAD); c.border = BOX
            c.alignment = Alignment(horizontal="center")
            v = ws.cell(r + 1, 1 + j, fm); body(v, fmt, bold=True, color=color); v.alignment = Alignment(horizontal="right")

    # ── 달력 (요일 머리글 + 6주 × [날짜, 지출]) ──
    for k, w in enumerate(WEEK):
        c = ws.cell(CAL_H, 1 + k, w); head(c); c.font = f(True, 10, SUN if k == 0 else SAT if k == 6 else INK)
    for w in range(6):
        dr, ar = CAL0 + w * 2, CAL0 + w * 2 + 1
        for k in range(7):
            n = w * 7 + k + 1; col = L(1 + k)
            d = ws.cell(dr, 1 + k, f'=IF(AND({n}-{OFF}>=1,{n}-{OFF}<={ND}),{n}-{OFF},"")')
            d.font = f(False, 9, SUN if k == 0 else SAT if k == 6 else SUB); d.fill = PatternFill("solid", fgColor=CALBG)
            d.alignment = Alignment(horizontal="left", vertical="top"); d.border = Border(top=thin, left=thin, right=thin)
            a = ws.cell(ar, 1 + k, f'=IF({col}{dr}="","",SUMIFS({TXR(4)},{TXR(0)},{col}{dr})-SUMIFS({TXR(4)},{TXR(0)},{col}{dr},{TXR(1)},"수입"))')
            a.font = f(True, 10); a.number_format = CALAMT; a.alignment = Alignment(horizontal="right", vertical="center")
            a.border = Border(bottom=thin, left=thin, right=thin)
        ws.row_dimensions[ar].height = 22
        for rr in (dr, ar):   # 오늘 칸 강조
            ws.conditional_formatting.add(f"A{rr}:G{rr}", FormulaRule(formula=[f'AND(A${dr}<>"",DATE({YR},{m},A${dr})=TODAY())'],
                                                                      fill=PatternFill("solid", fgColor=TODAY, bgColor=TODAY)))

    # ── 구분별 표 ──
    ws.cell(T0 - 2, 1, "항목별 합계").font = f(True, 12)
    ws.cell(T0 - 2, 3, "금액은 거래 내역 합계 · 월 예산은 직접 입력").font = f(False, 9, SUB)
    for i, h in enumerate(["구분(1차)", "항목(2차)", "금액", "메모", "월 예산"]): head(ws.cell(T0 - 1, 1 + i, h))
    head(ws.cell(T0 - 1, 8, "세부분류"))   # H열 (숨김): 앱의 세부분류 목록, 쉼표로 구분
    for i, (k, n) in enumerate(BUDGET):
        r = T0 + i
        body(ws.cell(r, 1, k), inp=True); body(ws.cell(r, 2, n), inp=True)
        body(ws.cell(r, 3, f"=SUMIFS({TXR(4)},{TXR(1)},A{r},{TXR(2)},B{r})"), WON)
        body(ws.cell(r, 4), inp=True); body(ws.cell(r, 5), WON, inp=True); body(ws.cell(r, 8, SUBS.get(n)), inp=True)
    mk = ws.cell(T_END, 1, "▲ 항목 추가 시 이 행 위에 행 삽입")
    mk.font = f(False, 9, SUB)
    ws.merge_cells(start_row=T_END, start_column=1, end_row=T_END, end_column=5)

    # ── 오른쪽: 반복 거래 (위) · 거래 내역 (아래) ──
    ws.cell(REP_H0 - 1, RC, "반복 거래 · 매달 이 날짜에 거래 내역으로 자동 입력").font = f(True, 12)
    for i, h in enumerate(REP_H): head(ws.cell(REP_H0, RC + i, h))
    for r in range(REP_H0 + 1, REP_H0 + 1 + REP_CAP):
        for j in range(len(REP_H)): body(ws.cell(r, RC + j), WON if j == 4 else None, inp=True)
    ws.cell(TX_H0 - 1, RC, "거래 내역 · 앱에서 입력하면 아래로 쌓여요 (ID는 앱이 써요)").font = f(True, 12)
    for i, h in enumerate(TX_H): head(ws.cell(TX_H0, RC + i, h))
    for r in range(TX0, TX0 + TX_FMT):
        for j in range(len(TX_H)): body(ws.cell(r, RC + j), WON if j == 4 else None, inp=j < 7)
        ws.cell(r, RC + 7).font = f(False, 8, "9CA3AF")
    REPR = lambda k: f"{cl(k)}{REP_H0 + 1}:{cl(k)}{REP_H0 + REP_CAP}"
    dvk = DataValidation(type="list", formula1='"수입,고정비,변동비"', allow_blank=True)
    ws.add_data_validation(dvk); dvk.add(f"{cl(1)}{TX0}:{cl(1)}{TX_END}"); dvk.add(REPR(1)); dvk.add(f"A{T0}:A{T_END - 1}")
    dvp = DataValidation(type="list", formula1='"신용카드,체크카드,현금"', allow_blank=True, showErrorMessage=True, errorStyle="information",
                         error="신용카드·체크카드·현금 중에서 고르는 걸 권해요. 그대로 쓰려면 '예'를 누르세요.")
    ws.add_data_validation(dvp); dvp.add(f"{cl(5)}{TX0}:{cl(5)}{TX_END}"); dvp.add(REPR(5))
    dv2 = DataValidation(type="list", formula1=f"=설정!$B$8:$B${BUD_END}", allow_blank=True,
                         showErrorMessage=True, errorStyle="information",
                         error="설정 시트 목록에 없는 항목입니다. 그대로 사용하려면 '예'를 누르세요.")
    ws.add_data_validation(dv2); dv2.add(f"B{T0}:B{T_END - 1}")

    # ── 수입 배분 그래프 (왼쪽, 달력 아래) · 그래프용 값은 오른쪽 끝(S~T열) ──
    GX = RC + 10
    ws.cell(4, GX, "그래프 데이터").font = f(True, 9, SUB)
    for i, (lab, fm) in enumerate([("고정비", "=B6"), ("변동비", "=C6"), ("일반저축", "=MAX(E6,0)")]):
        ws.cell(5 + i, GX, lab).font = f(False, 9, SUB)
        c = ws.cell(5 + i, GX + 1, fm); c.font = f(False, 9, SUB); c.number_format = WON
    pie = PieChart(); pie.title = f"{m}월 수입 배분 (지출·저축)"
    pie.add_data(Reference(ws, min_col=GX + 1, min_row=5, max_row=7), titles_from_data=False)
    pie.set_categories(Reference(ws, min_col=GX, min_row=5, max_row=7))
    pie.dataLabels = DataLabelList(); pie.dataLabels.showPercent = True; pie.dataLabels.showCatName = True
    pie.height = 7.5; pie.width = 15
    ws.add_chart(pie, f"A{CHART_ROW}")
    widths = [13, 13, 13, 13, 18, 13, 13, 3, 6, 9, 12, 10, 12, 12, 18, 10, 3]
    for i, w in enumerate(widths): ws.column_dimensions[L(1 + i)].width = w
    ws.column_dimensions["H"].hidden = True   # 세부분류 목록 (앱이 읽고 써요)
    ws.freeze_panes = "A3"

# ───────────────── 월별추이 ─────────────────
ys = wb.create_sheet("월별추이", 13)
title(ys, None)
ys["A1"] = '=설정!$B$4&"년 월별 수입·지출·저축 추이"'; ys["A1"].font = f(True, 16)
ys["A2"] = "각 월 시트에서 자동으로 가져옵니다 (입력 불필요)"; ys["A2"].font = f(False, 9, SUB)
H = ["월", "총 수입", "총 지출", "고정비", "변동비", "일반 저축", "대출상환 저축", "저축 합계", "저축률",
     "누적 일반 저축", "누적 대출상환", "누적 저축 합계"]
for i, h in enumerate(H): head(ys.cell(4, 1 + i, h))
SRC = ["$A$6", "$D$6", "$B$6", "$C$6", "$E$6", "$F$6", "$G$6"]   # 수입, 지출, 고정, 변동, 일반, 상환, 합계
for m in range(1, 13):
    r = 4 + m; sh = f"'{m}월'!"
    body(ys.cell(r, 1, f"{m}월"))
    for j, cell in enumerate(SRC):
        body(ys.cell(r, 2 + j, f"={sh}{cell}"), WON, color="008000", bold=(j == 6))
    body(ys.cell(r, 9, f"=IF(B{r}=0,0,H{r}/B{r})"), PCT)
    for j, c in enumerate("FGH"):
        body(ys.cell(r, 10 + j, f"=SUM(${c}$5:{c}{r})"), WON, bold=(c == "H"))
body(ys.cell(17, 1, "합계"), bold=True)
for j in range(2, 9):
    c = L(j); body(ys.cell(17, j, f"=SUM({c}5:{c}16)"), WON, bold=True)
body(ys.cell(17, 9, "=IF(B17=0,0,H17/B17)"), PCT, bold=True)
for j, c in enumerate("FGH"): body(ys.cell(17, 10 + j, f"={c}17"), WON, bold=True)
body(ys.cell(18, 1, "월평균(입력월)"), bold=True)
for j in range(2, 9):
    c = L(j); body(ys.cell(18, j, f'=IFERROR(AVERAGEIF($B$5:$B$16,">0",{c}5:{c}16),0)'), WON)
body(ys.cell(18, 9, "=IF(B18=0,0,H18/B18)"), PCT)
for j in range(3): body(ys.cell(18, 10 + j), WON)
body(ys.cell(19, 1, "저축 비중"), bold=True)
body(ys.cell(19, 6, "=IF($H$17=0,0,F17/$H$17)"), PCT); body(ys.cell(19, 7, "=IF($H$17=0,0,G17/$H$17)"), PCT)
ys["A20"] = "저축 비중: 연간 저축 합계 중 일반 저축 / 대출상환 저축이 차지하는 비율"; ys["A20"].font = f(False, 9, SUB)

cats = Reference(ys, min_col=1, min_row=5, max_row=16)
bar = BarChart(); bar.type = "col"; bar.grouping = "clustered"
bar.title = "월별 수입 · 지출 · 저축 합계"; bar.y_axis.title = "원"; bar.y_axis.numFmt = "#,##0"
for col in (2, 3, 8):
    bar.add_data(Reference(ys, min_col=col, min_row=4, max_row=16), titles_from_data=True)
bar.set_categories(cats)
ln = LineChart()
ln.add_data(Reference(ys, min_col=9, min_row=4, max_row=16), titles_from_data=True)
ln.y_axis.axId = 200; ln.y_axis.title = "저축률"; ln.y_axis.numFmt = "0%"; ln.y_axis.crosses = "max"
bar.y_axis.delete = False; ln.y_axis.delete = False; bar.x_axis.delete = False
bar += ln
bar.height = 9; bar.width = 22
ys.add_chart(bar, "N4")

sv = BarChart(); sv.type = "col"; sv.grouping = "stacked"; sv.overlap = 100
sv.title = "월별 저축 구성 (일반 · 대출상환)"; sv.y_axis.numFmt = "#,##0"
for col in (6, 7):
    sv.add_data(Reference(ys, min_col=col, min_row=4, max_row=16), titles_from_data=True)
sv.set_categories(cats); sv.y_axis.delete = False; sv.x_axis.delete = False
sv.height = 9; sv.width = 22
ys.add_chart(sv, "N23")

cu = LineChart(); cu.title = "누적 저축 (일반 · 대출상환 · 합계)"; cu.y_axis.numFmt = "#,##0"
for col in (10, 11, 12):
    cu.add_data(Reference(ys, min_col=col, min_row=4, max_row=16), titles_from_data=True)
cu.set_categories(cats); cu.y_axis.delete = False; cu.x_axis.delete = False
cu.height = 9; cu.width = 22
ys.add_chart(cu, "N42")
for col, w in zip("ABCDEFGHIJKL", [14, 14, 14, 13, 13, 14, 14, 15, 9, 15, 15, 16]): ys.column_dimensions[col].width = w
ys.freeze_panes = "B5"

# ───────────────── 자산관리 ─────────────────
aw = wb.create_sheet("자산관리", 14)
title(aw, None)
aw["A1"] = '=설정!$B$4&"년 자산관리"'; aw["A1"].font = f(True, 16)
aw["A2"] = "매월 말 기준 잔액을 노란 칸에 입력하세요. 부채는 양수로 입력합니다."; aw["A2"].font = f(False, 9, SUB)
MC = 4  # 1월 = D열
assert A0 == HDR + 1
for i, h in enumerate(["대분류", "중분류", "소분류"] + [f"{m}월" for m in range(1, 13)]): head(aw.cell(HDR, 1 + i, h))
base = {"현금": 15000000, "복지포인트": 500000, "예비현금": 5000000, "참주식": 80000000, "정윤주식": 30000000,
        "비트코인": 10000000, "아파트": 650000000, "참퇴직금": 40000000, "정윤퇴직금": 25000000,
        "참청약": 12000000, "정윤청약": 8000000, "주택담보대출": 300000000, "신용대출": 0, "사내대출": 20000000}
drift = {"현금": [0, 2500000, 4800000], "복지포인트": [0, -200000, 100000], "예비현금": [0, 0, 0],
         "참주식": [0, 2600000, -1400000], "정윤주식": [0, 900000, 400000], "비트코인": [0, -1200000, 1800000],
         "아파트": [0, 0, 5000000], "참퇴직금": [0, 350000, 700000], "정윤퇴직금": [0, 275000, 550000],
         "참청약": [0, 100000, 200000], "정윤청약": [0, 100000, 200000],
         "주택담보대출": [0, -650000, -1300000], "신용대출": [0, 0, 0], "사내대출": [0, -500000, -1000000]}
for i, (a, b, c) in enumerate(ASSETS):
    r = A0 + i
    for j, v in enumerate((a, b, c)): body(aw.cell(r, 1 + j, v), inp=True)
    for m in range(1, 13):
        v = None
        body(aw.cell(r, MC + m - 1, v), WON, inp=True)
aw.cell(A_END, 1, "▲ 항목 추가 시 이 행 위에 행 삽입").font = f(False, 9, SUB)
aw.merge_cells(start_row=A_END, start_column=1, end_row=A_END, end_column=3)
dvA = DataValidation(type="list", formula1='"유동자산,비유동자산,부채"', allow_blank=True)
aw.add_data_validation(dvA); dvA.add(f"A{A0}:A{A_END - 1}")

rA = f"$A${A0}:$A${A_END}"; rB = f"$B${A0}:$B${A_END}"
assert S0 == A_END + 2 and DEBT_ROW == S0 + 4
for i, h in enumerate(["요약", "", ""] + [f"{m}월" for m in range(1, 13)]): head(aw.cell(S0, 1 + i, h))
aw.merge_cells(start_row=S0, start_column=1, end_row=S0, end_column=3)
SUM_ROWS = [  # (라벨, 수식 생성 함수, 서식, 굵게)
    ("유동자산 합계", lambda c, p, m: f'=SUMIF({rA},"유동자산",{c}${A0}:{c}${A_END})', WON, False),
    ("비유동자산 합계", lambda c, p, m: f'=SUMIF({rA},"비유동자산",{c}${A0}:{c}${A_END})', WON, False),
    ("총자산", lambda c, p, m: f"={c}{S0+1}+{c}{S0+2}", WON, True),
    ("부채 합계", lambda c, p, m: f'=SUMIF({rA},"부채",{c}${A0}:{c}${A_END})', WON, False),
    ("순자산", lambda c, p, m: f"={c}{S0+3}-{c}{S0+4}", WON, True),
    ("부채비율 (부채/총자산)", lambda c, p, m: f"=IF({c}{S0+3}=0,0,{c}{S0+4}/{c}{S0+3})", PCT, False),
    ("전월 대비 총자산 증감", lambda c, p, m: "" if p is None else f'=IF(OR(COUNT({c}${A0}:{c}${A_END})=0,COUNT({p}${A0}:{p}${A_END})=0),"",{c}{S0+3}-{p}{S0+3})', WON, False),
    ("총자산 증감률", lambda c, p, m: "" if p is None else f'=IF(OR({c}{S0+7}="",{p}{S0+3}=0),"",{c}{S0+7}/{p}{S0+3})', PCT, False),
    ("전월 대비 순자산 증감", lambda c, p, m: "" if p is None else f'=IF(OR(COUNT({c}${A0}:{c}${A_END})=0,COUNT({p}${A0}:{p}${A_END})=0),"",{c}{S0+5}-{p}{S0+5})', WON, True),
    ("순자산 증감률 (수익률)", lambda c, p, m: "" if p is None else f'=IF(OR({c}{S0+9}="",{p}{S0+5}=0),"",{c}{S0+9}/{p}{S0+5})', PCT, True),
    ("이번 달 일반 저축 (가계부)", lambda c, p, m: f"='{m}월'!$E$6", WON, False),
    ("이번 달 대출상환 저축", lambda c, p, m: f"='{m}월'!$F$6", WON, False),
    ("이번 달 저축 합계", lambda c, p, m: f"={c}{S0+11}+{c}{S0+12}", WON, True),
    ("저축 외 자산 변동 (투자손익 등)", lambda c, p, m: "" if p is None else f'=IF({c}{S0+9}="","",{c}{S0+9}-{c}{S0+13})', WON, False),
    ("저축 제외 수익률", lambda c, p, m: "" if p is None else f'=IF(OR({c}{S0+14}="",{p}{S0+5}=0),"",{c}{S0+14}/{p}{S0+5})', PCT, False),
]
for i, (lab, fn, fmt, b) in enumerate(SUM_ROWS):
    r = S0 + 1 + i
    body(aw.cell(r, 1, lab), bold=b)
    aw.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    for m in range(1, 13):
        c = L(MC + m - 1); p = L(MC + m - 2) if m > 1 else None
        v = fn(c, p, m)
        hl = ACC if "수익률" in lab else ("008000" if lab.startswith("이번 달") and "합계" not in lab else INK)
        body(aw.cell(r, MC + m - 1, v if v != "" else None), fmt, bold=b, color=hl)
SUM_END = S0 + len(SUM_ROWS)

# ── 상단: 1월 대비 현재(가장 최근 입력월) 총자산·순자산 증가율 ──
T_ROW, N_ROW, D_ROW = S0 + 3, S0 + 5, S0 + 4          # 총자산 / 순자산 / 부채 요약 행
rng = lambda r: f"$D${r}:$O${r}"
IDX = f"(COLUMN({rng(T_ROW)})-COLUMN($D${T_ROW})+1)"
HASV = f"((({rng(T_ROW)}<>0)+({rng(D_ROW)}<>0))>0)"
aw["A4"] = "1월 대비 현재"; aw["A4"].font = f(True, 12)
aw["D4"] = "오늘 기준월"; aw["D4"].font = f(False, 9, SUB)
# 오늘 날짜의 월 (설정 연도보다 지난 해면 12월, 아직 오지 않은 해면 0)
aw["E4"] = "=IF(YEAR(TODAY())>설정!$B$4,12,IF(YEAR(TODAY())<설정!$B$4,0,MONTH(TODAY())))"
aw["E4"].number_format = '0"월";;"-"'; aw["E4"].font = f(True, 10, ACC)
aw["F4"] = "표시월"; aw["F4"].font = f(False, 9, SUB)
# 기준월 이하에서 값이 입력된 가장 최근 달 (이번 달 미입력이면 직전 입력월)
aw["G4"] = f"=SUMPRODUCT(MAX({HASV}*{IDX}*({IDX}<=$E$4)))"
aw["G4"].number_format = '0"월";;"-"'; aw["G4"].font = f(True, 10, ACC)
for i, h in enumerate(["구분", "", "", "1월", '="현재 ("&$G$4&"월)"', "증감액", "증가율"]):
    head(aw.cell(5, 1 + i, h if h else None))
aw.merge_cells("A5:C5")
for k, (lab, src) in enumerate([("총자산", T_ROW), ("순자산", N_ROW)]):
    r = 6 + k
    body(aw.cell(r, 1, lab), bold=True); aw.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
    body(aw.cell(r, 4, f"=$D${src}"), WON)
    body(aw.cell(r, 5, f'=IF($G$4=0,0,INDEX({rng(src)},$G$4))'), WON, bold=True)
    body(aw.cell(r, 6, f'=IF(OR($G$4<2,D{r}=0),"",E{r}-D{r})'), WON)
    body(aw.cell(r, 7, f'=IF(OR($G$4<2,D{r}=0),"",(E{r}-D{r})/ABS(D{r}))'), PCT, bold=True, color=ACC)
aw["H5"] = '=IF(AND($E$4>0,$G$4<$E$4),$E$4&"월 자산 미입력 → "&$G$4&"월 기준으로 표시","")'
aw["H5"].font = f(False, 9, "D97706")
aw["H6"] = "매일 오늘 날짜 기준으로 자동 갱신 · 1월 값이 없거나 2월 이후 입력이 없으면 비워 둡니다"; aw["H6"].font = f(False, 9, SUB)

# 중분류 합계
M0 = SUM_END + 2
for i, h in enumerate(["대분류", "중분류", ""] + [f"{m}월" for m in range(1, 13)]): head(aw.cell(M0, 1 + i, h))
MIDS = [("유동자산", "저축"), ("유동자산", "투자"), ("비유동자산", "부동산"), ("비유동자산", "퇴직금"),
        ("비유동자산", "청약"), ("부채", "대출")]
for i, (a, b) in enumerate(MIDS):
    r = M0 + 1 + i
    body(aw.cell(r, 1, a)); body(aw.cell(r, 2, b)); body(aw.cell(r, 3))
    for m in range(1, 13):
        c = L(MC + m - 1)
        body(aw.cell(r, MC + m - 1, f"=SUMIFS({c}${A0}:{c}${A_END},{rA},$A{r},{rB},$B{r})"), WON)
MID_END = M0 + len(MIDS)
aw.cell(MID_END + 1, 1, "중분류를 새로 만들었다면 이 표에도 한 줄 추가하세요 (대분류·중분류만 적으면 자동 합산).").font = f(False, 9, SUB)

# 그래프: 요약/중분류 표를 직접 참조 (입력 없는 달은 막대가 비어 보임)
cats = Reference(aw, min_col=MC, max_col=MC + 11, min_row=HDR)
lc = BarChart(); lc.type = "col"; lc.grouping = "clustered"
lc.title = "총자산 · 순자산 · 부채 추이"; lc.y_axis.numFmt = "#,##0"
for i, (lab, r) in enumerate([("총자산", S0 + 3), ("순자산", S0 + 5), ("부채", S0 + 4)]):
    lc.add_data(Reference(aw, min_col=MC, max_col=MC + 11, min_row=r), from_rows=True, titles_from_data=False)
    lc.series[i].tx = SeriesLabel(v=lab)
lc.set_categories(cats)
lc.y_axis.delete = False; lc.x_axis.delete = False
lc.height = 9; lc.width = 20
aw.add_chart(lc, f"Q{HDR}")

sc = BarChart(); sc.type = "col"; sc.grouping = "stacked"; sc.overlap = 100
sc.title = "자산 구성 변화 (중분류)"; sc.y_axis.numFmt = "#,##0"
for i in range(5):
    sc.add_data(Reference(aw, min_col=MC, max_col=MC + 11, min_row=M0 + 1 + i), from_rows=True, titles_from_data=False)
    sc.series[i].tx = SeriesLabel(v=MIDS[i][1])
sc.set_categories(cats)
sc.y_axis.delete = False; sc.x_axis.delete = False
sc.height = 9; sc.width = 20
aw.add_chart(sc, f"Q{HDR+20}")

aw.column_dimensions["A"].width = 12; aw.column_dimensions["B"].width = 10; aw.column_dimensions["C"].width = 16
for m in range(12): aw.column_dimensions[L(MC + m)].width = 15
aw.freeze_panes = f"D{A0}"

# 시트 순서: 설정, 월별추이, 자산관리, 1~12월
wb._sheets = [wb["월별추이"], wb["자산관리"]] + [wb[f"{m}월"] for m in range(1, 13)] + [wb["설정"]]
wb.active = 0
wb.save(OUT)
print("rows", A0, A_END, S0, SUM_END, M0)
