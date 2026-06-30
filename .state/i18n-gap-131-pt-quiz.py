import json
from pathlib import Path

ROOT = Path("src/lib/i18n")

# Add the 2 missing quiz grq keys to pt-PT
PT_NEW = {
    "routes.escola.quiz.grq.title": "Quiz: Gestao de Risco",
    "routes.escola.quiz.grq.description": "10 perguntas para testar os teus conhecimentos de gestao de risco: risco vs incerteza segundo Knight, estrategia 4T de resposta, ISO 31000, COSO ERM, Basileia III e TCFD."
}

def get_nested(d, path):
    cur = d
    for p in path.split("."):
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur

def set_nested(d, path, val):
    parts = path.split(".")
    cur = d
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = val

p = ROOT / "pt-PT.json"
d = json.loads(p.read_text(encoding="utf-8"))
added = 0
for k, v in PT_NEW.items():
    if get_nested(d, k) is None:
        set_nested(d, k, v)
        added += 1
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"pt-PT.json: +{added} quiz.grq keys")

# Verify all 5 locales have 7 gestao-risco keys
gr_keys = [
    "routes.aulas.curso.gestao-risco.title",
    "routes.aulas.curso.gestao-risco.tagline",
    "routes.escola.curso.gestao-risco.title",
    "routes.escola.curso.gestao-risco.tagline",
    "routes.escola.curso.gestao-risco.description",
    "routes.escola.quiz.grq.title",
    "routes.escola.quiz.grq.description",
]
for fname in ["pt-PT.json", "en.json", "fr.json", "ar.json", "tn.json"]:
    d2 = json.loads((ROOT / fname).read_text(encoding="utf-8"))
    have = sum(1 for k in gr_keys if get_nested(d2, k) is not None)
    print(f"  {fname}: {have}/7 gestao-risco keys")
print("DONE")
