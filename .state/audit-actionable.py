"""Show only text + expr-string items (visible-to-user UI chrome)."""
import json
from collections import Counter

with open('C:/Users/rafaa/Documents/GitHub/presuntinho/.state/i18n-audit-raw.json') as f:
    d = json.load(f)

actionable = []
for area, items in d['by_area'].items():
    for it in items:
        if it['kind'] in ('text', 'expr-string'):
            actionable.append((it['file'].split('\\')[-1], it['line'], it['kind'], it['snippet']))

print(f'Total actionable (text + expr-string): {len(actionable)}')
print()
# group by file
from collections import defaultdict
by_file = defaultdict(list)
for f, line, kind, sn in actionable:
    by_file[f].append((line, kind, sn))

for f in sorted(by_file, key=lambda k: -len(by_file[k])):
    items = by_file[f]
    print(f'== {f}: {len(items)} ==')
    for line, kind, sn in items:
        sn_short = sn.replace('\n', ' ')[:100]
        print(f'  L{line} [{kind}] {sn_short!r}')
    print()