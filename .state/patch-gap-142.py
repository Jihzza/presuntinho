#!/usr/bin/env python3
"""gap-142: adicionar gestao-projectos i18n em falta em TODOS os 5 locales.

Faltam:
- en.json: routes.aulas.curso.gestao-projectos
- pt-PT.json: routes.escola.curso.gestao-projectos + routes.aulas.curso.gestao-projectos
- tn.json: routes.escola.curso.gestao-projectos + routes.aulas.curso.gestao-projectos + routes.escola.quiz.gpq
- fr.json: routes.escola.curso.gestao-projectos + routes.aulas.curso.gestao-projectos + routes.escola.quiz.gpq
- ar.json: routes.escola.curso.gestao-projectos + routes.aulas.curso.gestao-projectos + routes.escola.quiz.gpq
"""
import json
from pathlib import Path

BASE = Path("C:/Users/rafaa/Documents/GitHub/presuntinho/src/lib/i18n")

# bloco gestao-projectos em EN (já existe em escola.curso, falta em aulas.curso)
gp_escola_curso_en = {
    "title": "Project Management",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery",
    "description": "Project management applied to business administration: foundations (definition of project, iron triangle scope/time/cost/quality, stakeholders, 5-phase life cycle, charter), traditional frameworks (PMBOK from PMI with 5 process groups × 10 knowledge areas, WBS, Gantt, critical path, EVM, compression), agile methodologies (Agile Manifesto, Scrum with 3 roles and 5 events, Kanban with WIP limits, Extreme Programming, scaling with SAFe/LeSS/Nexus), and practical tools and management (MS Project, Primavera, Jira; project risk management with 4T strategy; stakeholder mapping; paradigmatic cases like Apollo, iPhone, NHS NPfIT, Boeing 787; PMP/PRINCE2/CSM certifications)."
}
gp_aulas_curso_en = {
    "title": "Project Management",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery"
}

# bloco gestao-projectos em PT
gp_escola_curso_pt = {
    "title": "Gestão de Projectos",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega",
    "description": "Gestão de projectos aplicada à gestão empresarial: fundamentos (definição de projecto, triângulo de ferro scope/time/cost/quality, stakeholders, ciclo de vida em 5 fases, charter), frameworks tradicionais (PMBOK do PMI em 5 grupos de processos × 10 áreas de conhecimento, WBS, Gantt, caminho crítico, EVM, compressão), metodologias ágeis (Manifesto Ágil, Scrum com 3 papéis e 5 eventos, Kanban com WIP limits, Extreme Programming, scaling com SAFe/LeSS/Nexus), e ferramentas práticas e gestão (MS Project, Primavera, Jira; risk management de projecto com estratégia 4T; stakeholder mapping; casos paradigmáticos como Apollo, iPhone, NHS NPfIT, Boeing 787; certificações PMP/PRINCE2/CSM)."
}
gp_aulas_curso_pt = {
    "title": "Gestão de Projectos",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, caminho crítico, EVM e certificações PMP/PRINCE2 — do planeamento à entrega"
}

# TN (tunisian arabic transliteration)
gp_escola_curso_tn = {
    "title": "Gestion de Projets",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM w certifications PMP/PRINCE2 — min planification lel livraison",
    "description": "Gestion de projets appliquée lel gestion d'entreprise: fondements (définition de projet, triangle de fer scope/time/cost/quality, stakeholders, cycle de vie 5 phases, charter), frameworks traditionnels (PMBOK men PMI b 5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, compression), méthodologies agiles (Manifeste Agile, Scrum b 3 rôles w 5 événements, Kanban b WIP limits, XP, scaling b SAFe/LeSS/Nexus), w outils pratiques (MS Project, Primavera, Jira; gestion de risque de projet b stratégie 4T; stakeholder mapping; cas paradigmatiques kima Apollo, iPhone, NHS NPfIT, Boeing 787; certifications PMP/PRINCE2/CSM)."
}
gp_aulas_curso_tn = {
    "title": "Gestion de Projets",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM w certifications PMP/PRINCE2 — min planification lel livraison"
}

# FR
gp_escola_curso_fr = {
    "title": "Gestion de Projet",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 — de la planification à la livraison",
    "description": "Gestion de projet appliquée à la gestion d'entreprise: fondamentaux (définition de projet, triangle de fer scope/time/cost/quality, parties prenantes, cycle de vie en 5 phases, charte), frameworks traditionnels (PMBOK du PMI en 5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, compression), méthodologies agiles (Manifeste Agile, Scrum avec 3 rôles et 5 événements, Kanban avec WIP limits, Extreme Programming, scaling avec SAFe/LeSS/Nexus), et outils pratiques (MS Project, Primavera, Jira; gestion de risque de projet avec stratégie 4T; cartographie des parties prenantes; cas paradigmatiques comme Apollo, iPhone, NHS NPfIT, Boeing 787; certifications PMP/PRINCE2/CSM)."
}
gp_aulas_curso_fr = {
    "title": "Gestion de Projet",
    "tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 — de la planification à la livraison"
}

# AR
gp_escola_curso_ar = {
    "title": "إدارة المشاريع",
    "tagline": "إدارة الأعمال · PMBOK و Scrum و Kanban و WBS و المسار الحرج و EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم",
    "description": "إدارة المشاريع المطبقة في إدارة الأعمال: الأساسيات (تعريف المشروع، مثلث الحديد النطاق/الوقت/التكلفة/الجودة، أصحاب المصلحة، دورة الحياة من 5 مراحل، الميثاق)، الأطر التقليدية (PMBOK من PMI في 5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، الضغط)، المنهجيات الرشيقة (بيان Agile، Scrum بـ 3 أدوار و 5 أحداث، Kanban بحدود WIP، البرمجة القصوى، التحجيم بـ SAFe/LeSS/Nexus)، والأدوات العملية والإدارة (MS Project و Primavera و Jira؛ إدارة مخاطر المشروع باستراتيجية 4T؛ رسم خرائط أصحاب المصلحة؛ حالات paradigmatic مثل Apollo و iPhone و NHS NPfIT و Boeing 787؛ شهادات PMP/PRINCE2/CSM)."
}
gp_aulas_curso_ar = {
    "title": "إدارة المشاريع",
    "tagline": "إدارة الأعمال · PMBOK و Scrum و Kanban و WBS و المسار الحرج و EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم"
}

# gpq quiz blocks (já existe em en, pt-PT — falta em tn, fr, ar)
gpq_en = {
    "title": "Quiz: Project Management",
    "description": "Test your project management knowledge: foundations (project definition, scope/time/cost/quality triangle, stakeholders and Mendelow matrix, 5-phase life cycle), PMBOK and traditional processes (5 process groups × 10 knowledge areas, WBS, Gantt, critical path, EVM, fast-tracking vs crashing), agile methodologies (Agile Manifesto, Scrum with 3 roles and 5 events, Kanban with WIP limits, XP, scaling with SAFe), tools (MS Project, Jira, Asana), project risk management (4T strategy), and certifications (PMP, PRINCE2, CSM). 10 questions, 4 options each, with detailed explanations."
}

gpq_tn = {
    "title": "Quiz: Gestion de Projets",
    "description": "Testa les connaissances mte3ek f gestion de projets: fondements (définition de projet, triangle scope/time/cost/quality, stakeholders w matrice de Mendelow, cycle de vie 5 phases), PMBOK w processus traditionnels (5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, fast-tracking vs crashing), méthodologies agiles (Manifeste Agile, Scrum b 3 rôles w 5 événements, Kanban b WIP limits, XP, scaling b SAFe), outils (MS Project, Jira, Asana), gestion de risque de projet (stratégie 4T), w certifications (PMP, PRINCE2, CSM). 10 questions, 4 options kol wa7da, b explications détaillées."
}

gpq_fr = {
    "title": "Quiz : Gestion de Projet",
    "description": "Testez vos connaissances en gestion de projet: fondamentaux (définition de projet, triangle scope/time/cost/quality, parties prenantes et matrice de Mendelow, cycle de vie en 5 phases), PMBOK et processus traditionnels (5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, fast-tracking vs crashing), méthodologies agiles (Manifeste Agile, Scrum avec 3 rôles et 5 événements, Kanban avec WIP limits, XP, scaling avec SAFe), outils (MS Project, Jira, Asana), gestion de risque de projet (stratégie 4T), et certifications (PMP, PRINCE2, CSM). 10 questions, 4 options chacune, avec explications détaillées."
}

gpq_ar = {
    "title": "اختبار: إدارة المشاريع",
    "description": "اختبر معرفتك بإدارة المشاريع: الأساسيات (تعريف المشروع، مثلث النطاق/الوقت/التكلفة/الجودة، أصحاب المصلحة ومصفوفة Mendelow، دورة الحياة من 5 مراحل)، PMBOK والعمليات التقليدية (5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، fast-tracking مقابل crashing)، المنهجيات الرشيقة (بيان Agile، Scrum بـ 3 أدوار و 5 أحداث، Kanban بحدود WIP، XP، التحجيم بـ SAFe)، الأدوات (MS Project، Jira، Asana)، إدارة مخاطر المشروع (استراتيجية 4T)، والشهادات (PMP، PRINCE2، CSM). 10 أسئلة، 4 خيارات لكل سؤال، مع شروحات مفصلة."
}

# Updates per file: each entry is (path, value) to deep-set
updates = {
    "en.json": {
        ("routes", "aulas", "curso", "gestao-projectos"): gp_aulas_curso_en,
    },
    "pt-PT.json": {
        ("routes", "escola", "curso", "gestao-projectos"): gp_escola_curso_pt,
        ("routes", "aulas", "curso", "gestao-projectos"): gp_aulas_curso_pt,
    },
    "tn.json": {
        ("routes", "escola", "curso", "gestao-projectos"): gp_escola_curso_tn,
        ("routes", "aulas", "curso", "gestao-projectos"): gp_aulas_curso_tn,
        ("routes", "escola", "quiz", "gpq"): gpq_tn,
    },
    "fr.json": {
        ("routes", "escola", "curso", "gestao-projectos"): gp_escola_curso_fr,
        ("routes", "aulas", "curso", "gestao-projectos"): gp_aulas_curso_fr,
        ("routes", "escola", "quiz", "gpq"): gpq_fr,
    },
    "ar.json": {
        ("routes", "escola", "curso", "gestao-projectos"): gp_escola_curso_ar,
        ("routes", "aulas", "curso", "gestao-projectos"): gp_aulas_curso_ar,
        ("routes", "escola", "quiz", "gpq"): gpq_ar,
    },
}


def deep_set(d, path, value):
    cur = d
    for k in path[:-1]:
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    cur[path[-1]] = value


for fname, sets in updates.items():
    p = BASE / fname
    d = json.loads(p.read_text(encoding="utf-8"))
    before = len(d)
    for path, val in sets.items():
        deep_set(d, path, val)
    p.write_text(
        json.dumps(d, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    print(f"  {fname}: wrote {len(sets)} path(s)")

print("\n=== Verification ===")
from collections import OrderedDict
def collect_paths(d, prefix=""):
    out = []
    for k, v in d.items():
        path = prefix + "." + k if prefix else k
        if isinstance(v, dict):
            out.extend(collect_paths(v, path))
        else:
            out.append(path)
    return out

ref = json.loads((BASE / "en.json").read_text(encoding="utf-8"))
ref_paths = set(collect_paths(ref))
for fname in sorted(updates.keys()):
    d = json.loads((BASE / fname).read_text(encoding="utf-8"))
    p = set(collect_paths(d))
    missing = ref_paths - p
    extra = p - ref_paths
    print(f"  {fname}: missing={len(missing)} extra={len(extra)}")
    if missing:
        for m in sorted(missing)[:8]:
            print(f"    - {m}")
    if extra:
        for m in sorted(extra)[:8]:
            print(f"    + {m}")