import json
import sys

with open('static/quizzes/cgeq.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
qs = data['questions']
print(f'Total questions: {len(qs)}')
all_ok = True
for i, q in enumerate(qs):
    n_opts = len(q['opts'])
    has_exp = 'exp' in q
    a_ok = 0 <= q['a'] < n_opts
    if not a_ok or n_opts != 4:
        all_ok = False
    print(f'Q{i+1}: opts={n_opts}, a={q["a"]}, valid={a_ok}, has_exp={has_exp}')
print(f'ID: {data["id"]}, title: {data["title"]}')
print(f'All OK: {all_ok}')

# verify lessons
import os
for fn in sorted(os.listdir('static/lessons/contabilidade-gerencial/')):
    path = f'static/lessons/contabilidade-gerencial/{fn}'
    with open(path, 'r', encoding='utf-8') as f:
        lesson = json.load(f)
    secs = lesson.get('sections', []) if 'sections' in lesson else []
    n_secs = len(secs)
    keys = list(lesson.keys())
    print(f'{fn}: lines={sum(1 for _ in open(path))}, keys={keys[:10]}, sections={n_secs}')
