"""Smoke live-fire for gap-072 contabilidade-gerencial production deploy."""
import json
import sys
import urllib.request

base = "https://presuntinho.netlify.app"

# 1. Lesson JSON prod
url1 = f"{base}/lessons/contabilidade-gerencial/01-custos-classificacao-e-comportamento.json"
with urllib.request.urlopen(url1, timeout=15) as r:
    d1 = json.loads(r.read())
print(f"LESSON  {url1}")
print(f"  HTTP {r.status}  title: {d1['title']}")
print(f"  sections: {len(d1['sections'])}  audioLabel: {d1.get('audioLabel','')[:80]}")

# 2. Quiz JSON prod
url2 = f"{base}/quizzes/cgeq.json"
with urllib.request.urlopen(url2, timeout=15) as r:
    d2 = json.loads(r.read())
print(f"\nQUIZ    {url2}")
print(f"  HTTP {r.status}  title: {d2['title']}")
print(f"  questions: {len(d2['questions'])}")

# 3. Curso HTML — check for "Contabilidade Gerencial" string
url3 = f"{base}/escola/curso/contabilidade-gerencial/"
with urllib.request.urlopen(url3, timeout=15) as r:
    html = r.read().decode("utf-8", errors="ignore")
print(f"\nCURSO   {url3}")
print(f"  HTTP {r.status}  size: {len(html)} bytes")
print(f"  has 'Contabilidade Gerencial': {'Contabilidade Gerencial' in html}")
print(f"  has '01-custos-classificacao-e-comportamento': {'01-custos-classificacao-e-comportamento' in html}")
print(f"  has 'cgeq' (quiz slug): {'cgeq' in html}")

# 4. Deploys
url4 = f"https://api.netlify.com/api/v1/sites/presuntinho.netlify.app/deploys?per_page=3"
with urllib.request.urlopen(url4, timeout=15) as r:
    deploys = json.loads(r.read())
print(f"\nDEPLOYS (last 3)")
for x in deploys:
    cr = x.get("commit_ref") or "?"
    em = (x.get("error_message") or "")[:60]
    print(f"  {x['id'][:8]} | {x['state']:9} | {cr[:8]} | {em}")

# 5. Other key routes
print(f"\nOTHER ROUTES (sanity)")
for name, path in [
    ("Home", "/"),
    ("Escola", "/escola/"),
    ("Finanças", "/financas/"),
    ("Hábitos", "/habitos/"),
    ("Biblioteca", "/biblioteca/"),
    ("Trabalhos", "/trabalhos/"),
    ("Aulas", "/aulas/"),
    ("Definições", "/definicoes/"),
]:
    with urllib.request.urlopen(f"{base}{path}", timeout=15) as r:
        print(f"  HTTP {r.status} | {name:14} | {path}")
