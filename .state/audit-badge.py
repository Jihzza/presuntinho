"""Show only BadgeGrid items to understand the i18n-field issues."""
import json
with open('.state/i18n-audit-raw.json', encoding='utf-8') as f:
    d = json.load(f)

for area, items in d['by_area'].items():
    for it in items:
        if 'BadgeGrid' in it['file']:
            print(f"L{it['line']} [{it['kind']}] sev={it['severity']}")
            print(f"   snippet: {it['snippet'][:150]}")
            print()