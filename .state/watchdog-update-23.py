"""Update watchdog-todos.json: close gap-093 + gap-083-pending, add gap-094/095 (dispatched)."""
import json
from datetime import datetime
import pytz

tz = pytz.timezone('Europe/Lisbon')
now = datetime.now(tz).isoformat(timespec='seconds')

with open('.state/watchdog-todos.json', encoding='utf-8') as f:
    d = json.load(f)

# Move gap-093 from openItems → closedItems (BA #39 already deployed at b67ba84, 7/7 smoke URLs HTTP 200)
new_closed = []
new_open = []
for it in d['openItems']:
    if it['id'] == 'gap-093':
        new_closed.append({
            **it,
            'sha': 'b67ba84',
            'closed_at': now,
            'evidence': '7/7 smoke URLs HTTP 200 em produção após deploy 6a42e3df (commit b67ba84): /escola/curso/comercio-internacional/ 200, /escola/quiz/ciq 200, 4× lessons JSON 200 (01-teorias-comercio, 02-incoterms-trade-finance, 03-marketing-internacional-cultura, 04-gestao-risco-arbitragem), /static/quizzes/ciq.json 200. i18n 5 locales todas têm routes.escola.curso.comercio-internacional.{title,description,tagline}. npm run check 0/0; build green.',
            'done': True
        })
    elif it['id'] == 'gap-083-pending-ba35':
        # Stale reminder — BA #35 (gestao-operacoes) já foi gap-084 e está fechada (sha d72e55e)
        # BA #36/37/38/39 também já estão entregues (sha fb810cd/238a4dc/b123043/b67ba84).
        # Fechar como stale-reminder
        new_closed.append({
            **it,
            'sha': 'd72e55e',  # gap-084 BA #35 SHA
            'closed_at': now,
            'evidence': 'STALE REMINDER — BA #35 (gestao-operacoes) já foi gap-084 (sha d72e55e). BA #36/37/38/39 também já entregues (sha fb810cd/238a4dc/b123043/b67ba84). Continuar pipeline BA via gap-094 (BA #40 Estratégia Corporativa — dispatched Skander 2 deleg_e8f6de5b).',
            'done': True
        })
    else:
        new_open.append(it)

# Add gap-094 (BA #40 dispatched to Skander 2) and gap-095 (BadgeGrid i18n dispatched)
new_open.append({
    'id': 'gap-094',
    'category': 'licao/curso',
    'description': 'Cadeira BA #40: Estratégia Corporativa Avançada (slug estrategia-corporativa). Despachada para Skander 2 (deleg_e8f6de5b). 4 lições (PESTEL+Porter Five Forces+VRIO+SWOT+Ansoff+BCG+BSC+OKRs) + ecq quiz 10 perguntas + i18n 5 locales + CATALOGUE wired.',
    'severity': 'baixa',
    'source': 'watchdog-tick-2026-06-29-23',
    'created_at': now
})
new_open.append({
    'id': 'gap-095',
    'category': 'i18n',
    'description': 'BadgeGrid 8 badges (16 strings name+description) hardcoded em BADGE_CATALOG. Despachada para Skander 2 (deleg_a2e4822f). Vai criar components.badge.catalog.{b7..b15}.{name,description} × 5 locales (80 entries) e refactor BadgeGrid para usar $t().',
    'severity': 'alta',
    'source': 'watchdog-tick-2026-06-29-23',
    'created_at': now
})

d['openItems'] = new_open
d['closedItems'] = new_closed + d['closedItems']
d['lastUpdated'] = now

with open('.state/watchdog-todos.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f'Updated. openItems={len(d["openItems"])}, closedItems={len(d["closedItems"])}')
print()
print('OPEN ITEMS:')
for it in d['openItems']:
    print(f'  {it["id"]} | {it["category"]} | {it["severity"]} | {it["description"][:80]}')