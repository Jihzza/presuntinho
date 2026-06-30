"""Filter raw audit to only global components (not +page.svelte)."""
import json
from collections import defaultdict, Counter

with open('.state/i18n-audit-raw.json', encoding='utf-8') as f:
    d = json.load(f)

kinds = Counter()
files = Counter()
by_file = defaultdict(list)

for area, items in d['by_area'].items():
    for it in items:
        kinds[it['kind']] += 1
        file_short = it['file'].replace('\\', '/').split('/')[-1]
        files[file_short] += 1
        if it['kind'] in ('text', 'expr-string'):
            if not file_short.endswith('+page.svelte'):
                by_file[file_short].append((it['line'], it['kind'], it['snippet']))

print('=== TOTAL BY KIND ===')
for k, n in kinds.most_common():
    print(f'  {n:5d}  {k}')

print()
print('=== TOP 15 FILES (all kinds) ===')
for f, n in files.most_common(15):
    print(f'  {n:5d}  {f}')

print()
print('=== GLOBAL COMPONENTS WITH PT STRINGS (text+expr-string only) ===')
total_global = 0
for f in sorted(by_file, key=lambda k: -len(by_file[k])):
    n = len(by_file[f])
    total_global += n
    print(f'== {f}: {n} items ==')
    for line, kind, sn in by_file[f][:20]:
        sn_clean = sn.replace('\n', ' ')[:120]
        print(f'   L{line} [{kind}] {sn_clean}')
    print()

print(f'=== TOTAL GLOBAL COMPONENT ITEMS: {total_global} ===')