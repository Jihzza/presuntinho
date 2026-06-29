"""Close gap-073 — smoke gap-072 production verified, push state update."""
import json
from datetime import datetime, timezone, timedelta

p = '.state/watchdog-todos.json'
data = json.loads(open(p, encoding='utf-8').read())
now = datetime.now(timezone(timedelta(hours=2))).isoformat(timespec='seconds')

# Close gap-073
for it in data['openItems']:
    if it['id'] == 'gap-073':
        it['done'] = True
        it['sha'] = '7d8712e'  # state update commit
        it['closed_at'] = now
        it['updated_at'] = now
        it['evidence'] = '6/6 smoke URLs HTTP 200 (escola/, escola/curso/contabilidade-gerencial/, escola/quiz/cgeq, aulas/, 4/4 lessons JSON, cgeq.json). Deploy Netlify 6a421a73 ready (commit 7d8712e).'

# Move to closedItems
open_remaining = [it for it in data['openItems'] if not it.get('done')]
closed = [it for it in data['openItems'] if it.get('done')]
data['openItems'] = open_remaining
data.setdefault('closedItems', [])
data['closedItems'].extend(closed)
data['lastUpdated'] = now

with open(p, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f'OK  {p} updated')
print(f'  openItems: {len(data["openItems"])}')
print(f'  closedItems: {len(data["closedItems"])}')
