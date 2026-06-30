"""gap-140: add 5 gestao-projectos keys to pt-PT.json (parity with en/tn/fr/ar)."""
import json
from pathlib import Path

REPO = Path("C:/Users/rafaa/Documents/GitHub/presuntinho")

adds = {
    "routes.aulas.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega",
    "routes.aulas.curso.gestao-projectos.title": "Gestão de Projectos",
    "routes.escola.curso.gestao-projectos.description": "Gestão de projectos aplicada à gestão empresarial: fundamentos (definição de projecto, triângulo de ferro scope/time/cost/quality, stakeholders, ciclo de vida em 5 fases, charter), frameworks tradicionais (PMBOK do PMI em 5 grupos de processos × 10 áreas de conhecimento, WBS, Gantt, caminho crítico, EVM, compressão), metodologias ágeis (Manifesto Ágil, Scrum com 3 papéis e 5 eventos, Kanban com WIP limits, Extreme Programming, scaling com SAFe/LeSS/Nexus), e ferramentas práticas e gestão (MS Project, Primavera, Jira; risk management de projecto com estratégia 4T; stakeholder mapping; casos paradigmáticos como Apollo, iPhone, NHS NPfIT, Boeing 787; certificações PMP/PRINCE2/CSM).",
    "routes.escola.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega",
    "routes.escola.curso.gestao-projectos.title": "Gestão de Projectos",
}

# pt-PT
p = REPO / "src/lib/i18n/pt-PT.json"
d = json.load(open(p, encoding="utf-8"))
before = len(d)
d.update(adds)
with open(p, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
print(f"pt-PT: {before} -> {len(d)} keys (+5)")

# Verify parity across 5 locales
expected = list(adds.keys())
for loc in ["pt-PT", "en", "tn", "fr", "ar"]:
    d = json.load(open(REPO / f"src/lib/i18n/{loc}.json", encoding="utf-8"))
    miss = [k for k in expected if k not in d]
    status = "OK" if not miss else f"MISSING {len(miss)}: {miss}"
    print(f"{loc}: {status}")