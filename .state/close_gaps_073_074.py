"""Close gap-073 (smoke gap-072 live-fire confirmed verde) + gap-074 (HeartButton position confirmed)."""
import json, datetime
d = json.load(open('.state/watchdog-todos.json'))
now = datetime.datetime.now().astimezone().isoformat(timespec='seconds')
for item in d['openItems']:
    if item['id'] == 'gap-073':
        item['done'] = True
        item['sha'] = '7d8712e8'
        item['closed_at'] = now
        item['updated_at'] = now
        item['notes'] = 'smoke_gap_072.py verde: contabilidade-gerencial 4 licoes + cgeq 10 perguntas + escola/curso 200; deploy 6a421a73 ready'
    if item['id'] == 'gap-074':
        item['done'] = True
        item['sha'] = '67903cf'
        item['closed_at'] = now
        item['updated_at'] = now
        item['notes'] = 'skander1-audit-20260628T120818Z.md + heart-button-recommendation.md: FAB bottom-right, layout:228-231, z-60, aria-label PT, NAO aparece em /splash/ por design'
d['lastUpdated'] = now
json.dump(d, open('.state/watchdog-todos.json', 'w'), indent=2, ensure_ascii=False)
print(f"openItems: {len(d['openItems'])}")
print(f"closedItems: {len(d['closedItems'])}")
for o in d['openItems']:
    print(f"  {o['id']} | {o['category']:25} | sev={o['severity']:6} | {o['description'][:90]}")
