import urllib.request
import json

urls = [
    ('HOME', 'https://presuntinho.netlify.app/'),
    ('ESCOLA', 'https://presuntinho.netlify.app/escola/'),
    ('FINANCAS', 'https://presuntinho.netlify.app/financas/'),
    ('HABITOS', 'https://presuntinho.netlify.app/habitos/'),
    ('BIBLIOTECA', 'https://presuntinho.netlify.app/biblioteca/'),
    ('TRABALHOS', 'https://presuntinho.netlify.app/trabalhos/'),
    ('AULAS', 'https://presuntinho.netlify.app/aulas/'),
    ('DEFINICOES', 'https://presuntinho.netlify.app/definicoes/'),
    ('AGENTE', 'https://presuntinho.netlify.app/agente/'),
]
for name, url in urls:
    try:
        r = urllib.request.urlopen(url, timeout=15)
        body = r.read()
        print(f'{name}: {r.status} len={len(body)}')
    except Exception as e:
        print(f'{name}: ERR {e}')

print('---DEPLOYS---')
r = urllib.request.urlopen('https://api.netlify.com/api/v1/sites/presuntinho.netlify.app/deploys?per_page=3', timeout=15)
for d in json.loads(r.read()):
    msg = (d.get('error_message') or '')[:80]
    print(f'{d["id"][:8]} | {d["state"]} | {d.get("commit_ref","?")[:8]} | {msg}')