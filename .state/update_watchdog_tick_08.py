"""Update .state/watchdog-todos.json — close gap-072 + add gap-073/074."""
import json
from datetime import datetime, timezone, timedelta

p = '.state/watchdog-todos.json'
data = json.loads(open(p, encoding='utf-8').read())
now = datetime.now(timezone(timedelta(hours=2))).isoformat(timespec='seconds')

# Close gap-072
for it in data['openItems']:
    if it['id'] == 'gap-072':
        it['done'] = True
        it['sha'] = 'c78f49b'
        it['closed_at'] = now
        it['updated_at'] = now

# Move to closedItems
open_remaining = [it for it in data['openItems'] if not it.get('done')]
closed = [it for it in data['openItems'] if it.get('done')]
data['openItems'] = open_remaining

data.setdefault('closedItems', [])
data['closedItems'].extend(closed)
data['lastUpdated'] = now

# Add gap-073 — smoke do gap-072 em produção
new_gap_073 = {
    'id': 'gap-073',
    'category': 'smoke-fail',
    'description': 'Smoke live-fire do gap-072: confirmar que /escola/curso/contabilidade-gerencial, /escola/quiz/cgeq, /aulas retornam 200 em produção após deploy c78f49b. Confirmar que 5 i18n locales resolvem routes.escola.curso.contabilidade-gerencial.{title,description} sem fallback PT. Aguardar ~90s deploy Netlify e curl smoke.',
    'severity': 'baixa',
    'source': 'watchdog-tick-2026-06-29-08',
    'created_at': now
}
data['openItems'].append(new_gap_073)

# Add gap-074 — HeartButton decisão
new_gap_074 = {
    'id': 'gap-074',
    'category': 'feature-pedida-pelo-Daniel',
    'description': 'HeartButton ("botão do coração") - Daniel disse "no sítio que eu disse" em 2026-06-28. Estado actual: FAB bottom-right em / (visível, smoke OK). Confirmar com Daniel se esta posição é final ou mover para header global / hero / splash. Decisão pendente: heartbeat específico em / ou visível em todas as páginas (mais visível mas pode poluir UI). Próximo: assumir bottom-right como default (já está smoke-tested) e seguir com outras melhorias, OU pingar Daniel para escolher.',
    'severity': 'média',
    'source': 'audio-Daniel-2026-06-28',
    'created_at': now
}
data['openItems'].append(new_gap_074)

with open(p, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f'OK  {p} updated')
print(f'  openItems: {len(data["openItems"])}')
print(f'  closedItems: {len(data["closedItems"])}')
print(f'  lastUpdated: {data["lastUpdated"]}')
print()
print('--- OPEN ITEMS ---')
for it in data['openItems']:
    print(f'  {it["id"]} [{it["category"]:25}] [{it["severity"]:5}] {it["description"][:80]}')
