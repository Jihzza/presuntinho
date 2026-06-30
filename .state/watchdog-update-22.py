import json
p = 'C:/Users/rafaa/Documents/GitHub/presuntinho/.state/watchdog-todos.json'
d = json.loads(open(p, encoding='utf-8').read())

new_closed = list(d['closedItems'])
already = {x['id'] for x in new_closed}
if 'gap-092' not in already:
    new_closed.append({
        "id": "gap-092",
        "category": "licao/curso",
        "description": "Cadeira BA #38: Gestao da Inovacao e Tecnologia (slug gestao-inovacao). 4 licoes + giq quiz 10 perguntas + i18n 5 locales + CATALOGUE wired. Conteudo: Drucker sources, Christensen sustaining vs disruptive, Foster S-curve, tipos incremental/adjacent/transformational/breakthrough, open innovation Chesbrough, Stage-Gate Cooper; design thinking Brown + Double Diamond + lean startup Ries + MVPs; portfolio exploitation vs exploration March, Stage-Gate gating, BCG growth-share, real options thinking; platform thinking Parker/Van Alstyne, ecossistemas (Silicon Valley/Israel/Shenzhen), IP strategy, digital transformation Kane Phillips, Rogers adoption curve.",
        "sha": "b123043",
        "closed_at": "2026-06-29T21:50:00+02:00",
        "evidence": "Smoke 4/4 URLs HTTP 200 em producao: /escola/curso/gestao-inovacao/ 200, /escola/quiz/giq 200, /static/lessons/gestao-inovacao/01-inovacao-estrategica.json 200, /static/quizzes/giq.json 200. Deploy 6a42d37b ready (commit b123043)."
    })

new_open = [x for x in d['openItems'] if x['id'] != 'gap-092']
new_open.append({
    "id": "gap-093",
    "category": "licao/curso",
    "description": "Cadeira BA #39: Comercio Internacional (slug comercio-internacional). Despachada para Skander 2 (deleg_64b0b5f5). 4 licoes + ciq quiz 10 perguntas + i18n 5 locales + CATALOGUE wired. Conteudo: Smith/Ricardo/Heckscher-Ohlin/GATT, Uppsala/born global, Incoterms 2020 + L/C trade finance, marketing internacional 4Ps + Hofstede + CISG/arbitragem.",
    "severity": "baixa",
    "source": "watchdog-tick-2026-06-29-22",
    "created_at": "2026-06-29T21:50:00+02:00"
})

d['openItems'] = new_open
d['closedItems'] = new_closed
d['lastUpdated'] = '2026-06-29T21:50:00+02:00'

open(p, 'w', encoding='utf-8').write(json.dumps(d, indent=2, ensure_ascii=False))
print(f'OPEN={len(d["openItems"])} CLOSED={len(d["closedItems"])}')
print('---OPEN---')
for x in d['openItems']:
    print(f'  {x["id"]:22s} [{x["severity"]:6s}] {x["description"][:65]}')
print('---LAST 3 CLOSED---')
for x in d['closedItems'][-3:]:
    print(f'  {x["id"]:22s} sha={x.get("sha","?")[:8]} {x["closed_at"]}')