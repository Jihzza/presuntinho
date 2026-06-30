"""Filter the raw i18n audit to actionable items: real PT UI text NOT in $t()."""
import json
from collections import Counter

with open('C:/Users/rafaa/Documents/GitHub/presuntinho/.state/i18n-audit-raw.json') as f:
    d = json.load(f)

# Group by file, show top counts and a sample of snippets
files = {}
for area, items in d['by_area'].items():
    for it in items:
        f = it['file'].split('\\')[-1]
        files.setdefault(f, []).append(it)

# Sort by count desc
ranked = sorted(files.items(), key=lambda kv: -len(kv[1]))
print(f'Total files: {len(ranked)}')
print()
for f, items in ranked[:20]:
    print(f'== {f}: {len(items)} hits ==')
    kinds = Counter(it['kind'] for it in items)
    print(f'  kinds: {dict(kinds)}')
    # show 3 samples
    for it in items[:3]:
        sn = it['snippet'][:80]
        print(f'  L{it["line"]} [{it["kind"]}] {sn!r}')
    print()