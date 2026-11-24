#!/usr/bin/env python3
"""세법 수치 대장(옵시디언 _도구/세법수치대장.json 복사본) → js/rules.js

세법이 바뀌면: 옵시디언 대장을 먼저 고치고 → 이 폴더에 복사 → `python3 tools/rules/gen.py`
값을 js/rules.js에서 직접 고치지 않는다.
"""
import json, pathlib, datetime
root = pathlib.Path(__file__).resolve().parents[2]
src = root / 'tools/rules/세법수치대장.json'
d = json.loads(src.read_text(encoding='utf-8'))
items = {}
checked = []
for x in d['수치']:
    items[x['id']] = x['값']
    checked.append(x['확인일'])
meta = {
    '기준연도': 2026,
    '마지막확인일': max(checked),
    '항목수': len(items),
}
out = ("// 자동 생성 파일: tools/rules/gen.py 가 세법수치대장.json 으로 만든다. 직접 고치지 않는다.\n"
       "// 값의 근거(조문·고시)와 확인일은 대장과 옵시디언 「세법 원문 링크」에 있다.\n"
       "const RULES_META = " + json.dumps(meta, ensure_ascii=False) + ";\n"
       "const RULES = Object.freeze(" + json.dumps(items, ensure_ascii=False, indent=0) + ");\n"
       "if (typeof module !== 'undefined') module.exports = {RULES, RULES_META};\n")
(root / 'js/rules.js').write_text(out, encoding='utf-8')
print('js/rules.js', len(items), '항목, 마지막 확인일', meta['마지막확인일'])
