import json
from collections import Counter
with open('C:/Users/rafaa/Documents/GitHub/presuntinho/.state/i18n-audit-raw.json') as f:
    d = json.load(f)
print('total:', d['total'])
print('files_scanned:', d['files_scanned'])
by_sev = {}
for area, items in d['by_area'].items():
    for it in items:
        by_sev[it['severity']] = by_sev.get(it['severity'], 0) + 1
print('by severity:', by_sev)
files = Counter()
for area, items in d['by_area'].items():
    for it in items:
        path = it['file']
        files[path.split(chr(92))[-1]] += 1
print('top files:')
for f, n in files.most_common(20):
    print(' ', n, f)