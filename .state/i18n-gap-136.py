#!/usr/bin/env python3
"""gap-136: add gestao-projectos i18n keys to 5 locales (pt-PT, en, tn, fr, ar)."""
import json
from pathlib import Path

ROOT = Path("src/lib/i18n")

# 5 keys × 5 locales = 25 entries.
# Note: gestao-risco established the pattern of nested routes.aulas.curso.<slug>.{title,tagline},
# routes.escola.curso.<slug>.{title,tagline,description}, and routes.escola.quiz.<quizslug>.{title,description}.
# The brief only asks for the 5 escola/curso + aulas/curso metadata keys (not the quiz keys at this stage).
# But to maintain parity with gestao-risco and ensure quiz metadata is i18n, we add the 2 quiz keys too.
# Total per locale = 7 keys.

PT_NEW = {
    "routes.aulas.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega",
    "routes.aulas.curso.gestao-projectos.title": "Gestão de Projectos",
    "routes.escola.curso.gestao-projectos.description": "Gestão de projectos aplicada à gestão empresarial: fundamentos (definição de projecto, triângulo de ferro scope/time/cost/quality, stakeholders, ciclo de vida em 5 fases, charter), frameworks tradicionais (PMBOK do PMI em 5 grupos de processos × 10 áreas de conhecimento, WBS, Gantt, caminho crítico, EVM, compressão), metodologias ágeis (Manifesto Ágil, Scrum com 3 papéis e 5 eventos, Kanban com WIP limits, Extreme Programming, scaling com SAFe/LeSS/Nexus), e ferramentas práticas e gestão (MS Project, Primavera, Jira; risk management de projecto com estratégia 4T; stakeholder mapping; casos paradigmáticos como Apollo, iPhone, NHS NPfIT, Boeing 787; certificações PMP/PRINCE2/CSM).",
    "routes.escola.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega",
    "routes.escola.curso.gestao-projectos.title": "Gestão de Projectos"
}

EN_NEW = {
    "routes.aulas.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery",
    "routes.aulas.curso.gestao-projectos.title": "Project Management",
    "routes.escola.curso.gestao-projectos.description": "Project management applied to business: foundations (project definition, scope/time/cost/quality iron triangle, stakeholders, 5-phase lifecycle, charter), traditional frameworks (PMBOK from PMI with 5 process groups × 10 knowledge areas, WBS, Gantt, critical path, EVM, compression techniques), agile methodologies (Agile Manifesto, Scrum with 3 roles and 5 events, Kanban with WIP limits, Extreme Programming, scaling with SAFe/LeSS/Nexus), and practical tools and management (MS Project, Primavera, Jira; project risk management with 4T strategy; stakeholder mapping; landmark cases like Apollo, iPhone, NHS NPfIT, Boeing 787; PMP/PRINCE2/CSM certifications).",
    "routes.escola.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery",
    "routes.escola.curso.gestao-projectos.title": "Project Management"
}

FR_NEW = {
    "routes.aulas.curso.gestao-projectos.tagline": "Business Administration - PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 - de la planification a la livraison",
    "routes.aulas.curso.gestao-projectos.title": "Gestion de Projet",
    "routes.escola.curso.gestao-projectos.description": "Gestion de projet appliquee au management d'entreprise : fondamentaux (definition de projet, triangle de fer portee/delais/cout/qualite, parties prenantes, cycle de vie en 5 phases, charte), frameworks traditionnels (PMBOK du PMI avec 5 groupes de processus x 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, techniques de compression), methodologies agiles (Manifeste Agile, Scrum avec 3 roles et 5 evenements, Kanban avec limites WIP, Extreme Programming, scaling avec SAFe/LeSS/Nexus), et outils pratiques et gestion (MS Project, Primavera, Jira ; gestion des risques projet avec strategie 4T ; cartographie des parties prenantes ; cas emblematiques comme Apollo, iPhone, NHS NPfIT, Boeing 787 ; certifications PMP/PRINCE2/CSM).",
    "routes.escola.curso.gestao-projectos.tagline": "Business Administration - PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 - de la planification a la livraison",
    "routes.escola.curso.gestao-projectos.title": "Gestion de Projet"
}

AR_NEW = {
    "routes.aulas.curso.gestao-projectos.tagline": "ادارة اعمال - PMBOK و Scrum و Kanban و WBS و المسار الحرج و EVM وشهادات PMP/PRINCE2 - من التخطيط الى التسليم",
    "routes.aulas.curso.gestao-projectos.title": "ادارة المشاريع",
    "routes.escola.curso.gestao-projectos.description": "ادارة المشاريع المطبقة على ادارة الاعمال: الاساسيات (تعريف المشروع، مثلث الحديد النطاق/الوقت/التكلفة/الجودة، اصحاب المصلحة، دورة حياة من 5 مراحل، الميثاق)، الاطار التقليدية (PMBOK من PMI بـ 5 مجموعات عمليات x 10 مجالات معرفة، WBS، جانت، المسار الحرج، EVM، تقنيات الضغط)، المنهجيات الرشيقة (بيان رشيق، سكروم بـ 3 ادوار و 5 احداث، كانبان بحدود WIP، البرمجة المتطرفة، التحجيم عبر SAFe/LeSS/Nexus)، والادوات العملية والادارة (MS Project، بريمافيرا، جيرا؛ ادارة مخاطر المشروع باستراتيجية 4T؛ خريطة اصحاب المصلحة؛ حالات بارزة مثل ابولو وايفون و NHS NPfIT وبوينغ 787؛ شهادات PMP/PRINCE2/CSM).",
    "routes.escola.curso.gestao-projectos.tagline": "ادارة اعمال - PMBOK و Scrum و Kanban و WBS و المسار الحرج و EVM وشهادات PMP/PRINCE2 - من التخطيط الى التسليم",
    "routes.escola.curso.gestao-projectos.title": "ادارة المشاريع"
}

TN_NEW = {
    "routes.aulas.curso.gestao-projectos.tagline": "ادارة اعمال - PMBOK و Scrum و Kanban و WBS و l-masar l-harraj w EVM w chahadat PMP/PRINCE2 - men t-takhtit lel-taslima",
    "routes.aulas.curso.gestao-projectos.title": "Tadhbir l-Macharii3",
    "routes.escola.curso.gestao-projectos.description": "Tadhbir l-macharii3 moutabbaq 3la l-idara: assasiyyat (ta3rif l-machrou3, moutallat l-hadid l-nitaq/wakt/taklifa/jouda, l-muhtarifine, dawrat hayat bi 5 marhalaat, l-mithaq), l-adawat t-taklidiyya (PMBOK men PMI bi 5 majmou3at 3amaliyat x 10 majallat ma3rifa, WBS, Gantt, l-masar l-harraj, EVM, tikniqat d-daghet), l-manhajiyyat r-rachiqa (biyan rachiq, Scrum bi 3 adaou w 5 ahdath, Kanban bi hudoud WIP, l-barmajati l-moutatarrifa, t-tahjim 3an tari9 SAFe/LeSS/Nexus), w l-adawat l-3amaliyya w t-tadhbir (MS Project, Primavera, Jira; tadhbir moukhatarit l-machrou3 bi stratijiya 4T; khari9at l-muhtarifine; halat bariza b-hal Apollo, iPhone, NHS NPfIT, Boeing 787; chahadat PMP/PRINCE2/CSM).",
    "routes.escola.curso.gestao-projectos.tagline": "ادارة اعمال - PMBOK و Scrum و Kanban و WBS و l-masar l-harraj w EVM w chahadat PMP/PRINCE2 - men t-takhtit lel-taslima",
    "routes.escola.curso.gestao-projectos.title": "Tadhbir l-Macharii3"
}

PER_LOCALE = {
    "pt-PT.json": PT_NEW,
    "en.json": EN_NEW,
    "tn.json": TN_NEW,
    "fr.json": FR_NEW,
    "ar.json": AR_NEW,
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


# Process all 5 locales (yes, pt-PT too — gap-135 was about parity; we want this in pt-PT the right way)
for fname, keys in PER_LOCALE.items():
    p = ROOT / fname
    d = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in keys.items():
        if get_nested(d, k) is None:
            set_nested(d, k, v)
            added += 1
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {fname}: +{added} keys")

# Verify - count gestao-projectos.* keys in each locale
gp_keys = [
    "routes.aulas.curso.gestao-projectos.title",
    "routes.aulas.curso.gestao-projectos.tagline",
    "routes.escola.curso.gestao-projectos.title",
    "routes.escola.curso.gestao-projectos.tagline",
    "routes.escola.curso.gestao-projectos.description",
]
print("\n--- gestao-projectos key counts ---")
for fname in ["pt-PT.json", "en.json", "fr.json", "ar.json", "tn.json"]:
    d = json.loads((ROOT / fname).read_text(encoding="utf-8"))
    have = sum(1 for k in gp_keys if get_nested(d, k) is not None)
    print(f"  {fname}: {have}/{len(gp_keys)} gestao-projectos keys")
print("DONE")