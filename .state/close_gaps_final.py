"""Final close: move gap-073 (truncated SHA fix) + gap-074 from openItems to closedItems."""
import json, datetime
d = json.load(open('.state/watchdog-todos.json'))
now = datetime.datetime.now().astimezone().isoformat(timespec='seconds')

# fix gap-073 SHA truncation
for c in d.get('closedItems', []):
    if c.get('id') == 'gap-073' and c.get('sha') == '7d8712e':
        c['sha'] = '7d8712e8'
        c['updated_at'] = now
        c['evidence'] = '6/6 smoke URLs HTTP 200 (escola/, escola/curso/contabilidade-gerencial/, escola/quiz/cgeq, aulas/, 4/4 lessons JSON, cgeq.json). Deploy Netlify 6a421a73 ready (commit 7d8712e8).'
        print('gap-073 SHA corrected: 7d8712e -> 7d8712e8')

# move gap-074 from openItems to closedItems
moved = []
new_open = []
for o in d.get('openItems', []):
    if o.get('id') == 'gap-074':
        moved.append({
            'id': 'gap-074',
            'description': o.get('description', ''),
            'category': o.get('category', 'feature-pedida-pelo-Daniel'),
            'severity': o.get('severity', 'média'),
            'source': o.get('source', ''),
            'created_at': o.get('created_at', now),
            'done': True,
            'sha': '67903cf',
            'closed_at': now,
            'updated_at': now,
            'evidence': 'skander1-audit-20260628T120818Z.md (HeartButton matriz 5/5 areas verde) + heart-button-recommendation.md (Skander 1 recomenda manter FAB bottom-right): HeartButton global em +layout.svelte:228-231, position fixed right:max(1rem, env(safe-area-inset-right)) bottom:calc(72px+...), z-index 60 (acima bottom-nav 50), 56x56px touch target, aria-label PT, NAO aparece em /splash/ por design.'
        })
        print('gap-074 moved openItems -> closedItems')
    else:
        new_open.append(o)

d['openItems'] = new_open
d['closedItems'].append(moved[0]) if moved else None
d['lastUpdated'] = now
json.dump(d, open('.state/watchdog-todos.json', 'w'), indent=2, ensure_ascii=False)

print(f'openItems: {len(d["openItems"])}')
print(f'closedItems: {len(d["closedItems"])}')
for o in d['openItems']:
    print(f'  {o["id"]:8} | {o.get("category","?"):25} | sev={o.get("severity","?"):6} | {o.get("description","")[:80]}')
