#!/usr/bin/env python3
"""Insert routes.*.gestao-projectos.{title,tagline,description} into
en/tn/fr/ar.json (parity with pt-PT default).
7 keys × 4 locales = 28 entries.
"""
import json
import sys
from pathlib import Path

ROOT = Path("src/lib/i18n")

# Per-locale values (PT default already in code; here we cover en/tn/fr/ar)
LOCALES = {
    "en": {
        "routes.aulas.curso.gestao-projectos.title": "Project Management",
        "routes.aulas.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery",
        "routes.escola.curso.gestao-projectos.title": "Project Management",
        "routes.escola.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, critical path, EVM and PMP/PRINCE2 certifications — from planning to delivery",
        "routes.escola.curso.gestao-projectos.description": "Project management applied to business administration: foundations (definition of project, iron triangle scope/time/cost/quality, stakeholders, 5-phase life cycle, charter), traditional frameworks (PMBOK from PMI with 5 process groups × 10 knowledge areas, WBS, Gantt, critical path, EVM, compression), agile methodologies (Agile Manifesto, Scrum with 3 roles and 5 events, Kanban with WIP limits, Extreme Programming, scaling with SAFe/LeSS/Nexus), and practical tools and management (MS Project, Primavera, Jira; project risk management with 4T strategy; stakeholder mapping; paradigmatic cases like Apollo, iPhone, NHS NPfIT, Boeing 787; PMP/PRINCE2/CSM certifications).",
        "routes.escola.quiz.gpq.title": "Quiz: Project Management",
        "routes.escola.quiz.gpq.description": "Test your project management knowledge: foundations (project definition, scope/time/cost/quality triangle, stakeholders and Mendelow matrix, 5-phase life cycle), PMBOK and traditional processes (5 process groups × 10 knowledge areas, WBS, Gantt, critical path, EVM, fast-tracking vs crashing), agile methodologies (Agile Manifesto, Scrum with 3 roles and 5 events, Kanban with WIP limits, XP, scaling with SAFe), tools (MS Project, Jira, Asana), project risk management (4T strategy), and certifications (PMP, PRINCE2, CSM). 10 questions, 4 options each, with detailed explanations.",
    },
    "tn": {
        "routes.aulas.curso.gestao-projectos.title": "إدارة المشاريع",
        "routes.aulas.curso.gestao-projectos.tagline": "إدارة الأعمال · PMBOK، Scrum، Kanban، WBS، المسار الحرج، EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم",
        "routes.escola.curso.gestao-projectos.title": "إدارة المشاريع",
        "routes.escola.curso.gestao-projectos.tagline": "إدارة الأعمال · PMBOK، Scrum، Kanban، WBS، المسار الحرج، EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم",
        "routes.escola.curso.gestao-projectos.description": "إدارة المشاريع المطبقة على إدارة الأعمال: الأسس (تعريف المشروع، مثلث الحديد scope/time/cost/quality، أصحاب المصلحة، دورة الحياة في 5 مراحل، الميثاق)، الأطر التقليدية (PMBOK من PMI في 5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، الضغط)، المنهجيات الرشيقة (Manifesto Agile، Scrum بـ 3 أدوار و5 أحداث، Kanban بحدود WIP، Extreme Programming، التحجيم بـ SAFe/LeSS/Nexus)، والأدوات العملية والإدارة (MS Project، Primavera، Jira؛ إدارة مخاطر المشروع باستراتيجية 4T؛ رسم خرائط أصحاب المصلحة؛ حالات نموذجية مثل Apollo، iPhone، NHS NPfIT، Boeing 787؛ شهادات PMP/PRINCE2/CSM).",
        "routes.escola.quiz.gpq.title": "اختبار: إدارة المشاريع",
        "routes.escola.quiz.gpq.description": "اختبر معرفتك بإدارة المشاريع: الأسس (تعريف المشروع، مثلث scope/time/cost/quality، أصحاب المصلحة ومصفوفة Mendelow، دورة الحياة في 5 مراحل)، PMBOK والعمليات التقليدية (5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، fast-tracking vs crashing)، المنهجيات الرشيقة (Manifesto Agile، Scrum بـ 3 أدوار و5 أحداث، Kanban بحدود WIP، XP، التحجيم بـ SAFe)، الأدوات (MS Project، Jira، Asana)، إدارة مخاطر المشروع (استراتيجية 4T)، والشهادات (PMP، PRINCE2، CSM). 10 أسئلة، 4 خيارات لكل سؤال، مع شرح مفصل.",
    },
    "fr": {
        "routes.aulas.curso.gestao-projectos.title": "Gestion de Projet",
        "routes.aulas.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 — de la planification à la livraison",
        "routes.escola.curso.gestao-projectos.title": "Gestion de Projet",
        "routes.escola.curso.gestao-projectos.tagline": "Business Administration · PMBOK, Scrum, Kanban, WBS, chemin critique, EVM et certifications PMP/PRINCE2 — de la planification à la livraison",
        "routes.escola.curso.gestao-projectos.description": "Gestion de projet appliquée au management d'entreprise : fondamentaux (définition de projet, triangle de fer scope/time/cost/quality, parties prenantes, cycle de vie en 5 phases, charte), cadres traditionnels (PMBOK du PMI avec 5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, compression), méthodologies agiles (Manifeste Agile, Scrum avec 3 rôles et 5 événements, Kanban avec limites WIP, Extreme Programming, mise à l'échelle avec SAFe/LeSS/Nexus), et outils pratiques et gestion (MS Project, Primavera, Jira ; gestion des risques projet avec stratégie 4T ; cartographie des parties prenantes ; cas paradigmatiques comme Apollo, iPhone, NHS NPfIT, Boeing 787 ; certifications PMP/PRINCE2/CSM).",
        "routes.escola.quiz.gpq.title": "Quiz : Gestion de Projet",
        "routes.escola.quiz.gpq.description": "Testez vos connaissances en gestion de projet : fondamentaux (définition de projet, triangle scope/time/cost/quality, parties prenantes et matrice de Mendelow, cycle de vie en 5 phases), PMBOK et processus traditionnels (5 groupes de processus × 10 domaines de connaissance, WBS, Gantt, chemin critique, EVM, fast-tracking vs crashing), méthodologies agiles (Manifeste Agile, Scrum avec 3 rôles et 5 événements, Kanban avec limites WIP, XP, mise à l'échelle avec SAFe), outils (MS Project, Jira, Asana), gestion des risques projet (stratégie 4T), et certifications (PMP, PRINCE2, CSM). 10 questions, 4 options chacune, avec explications détaillées.",
    },
    "ar": {
        "routes.aulas.curso.gestao-projectos.title": "إدارة المشاريع",
        "routes.aulas.curso.gestao-projectos.tagline": "إدارة الأعمال · PMBOK، Scrum، Kanban، WBS، المسار الحرج، EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم",
        "routes.escola.curso.gestao-projectos.title": "إدارة المشاريع",
        "routes.escola.curso.gestao-projectos.tagline": "إدارة الأعمال · PMBOK، Scrum، Kanban، WBS، المسار الحرج، EVM وشهادات PMP/PRINCE2 — من التخطيط إلى التسليم",
        "routes.escola.curso.gestao-projectos.description": "إدارة المشاريع المطبقة على إدارة الأعمال: الأسس (تعريف المشروع، مثلث الحديد scope/time/cost/quality، أصحاب المصلحة، دورة الحياة في 5 مراحل، الميثاق)، الأطر التقليدية (PMBOK من PMI في 5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، الضغط)، المنهجيات الرشيقة (Manifesto Agile، Scrum بـ 3 أدوار و5 أحداث، Kanban بحدود WIP، Extreme Programming، التحجيم بـ SAFe/LeSS/Nexus)، والأدوات العملية والإدارة (MS Project، Primavera، Jira؛ إدارة مخاطر المشروع باستراتيجية 4T؛ رسم خرائط أصحاب المصلحة؛ حالات نموذجية مثل Apollo، iPhone، NHS NPfIT، Boeing 787؛ شهادات PMP/PRINCE2/CSM).",
        "routes.escola.quiz.gpq.title": "اختبار: إدارة المشاريع",
        "routes.escola.quiz.gpq.description": "اختبر معرفتك بإدارة المشاريع: الأسس (تعريف المشروع، مثلث scope/time/cost/quality، أصحاب المصلحة ومصفوفة Mendelow، دورة الحياة في 5 مراحل)، PMBOK والعمليات التقليدية (5 مجموعات عمليات × 10 مجالات معرفة، WBS، Gantt، المسار الحرج، EVM، fast-tracking vs crashing)، المنهجيات الرشيقة (Manifesto Agile، Scrum بـ 3 أدوار و5 أحداث، Kanban بحدود WIP، XP، التحجيم بـ SAFe)، الأدوات (MS Project، Jira، Asana)، إدارة مخاطر المشروع (استراتيجية 4T)، والشهادات (PMP، PRINCE2، CSM). 10 أسئلة، 4 خيارات لكل سؤال، مع شرح مفصل.",
    },
}


def insert_at(path: Path, new_keys: dict) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    inserted = 0
    skipped = 0
    for k, v in new_keys.items():
        if k in data:
            skipped += 1
            continue
        data[k] = v
        inserted += 1
    # Re-write with stable ordering + 2-space indent + ensure_ascii=False so PT/AR/TN keep native glyphs.
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return inserted, skipped


total_ins = 0
for loc, keys in LOCALES.items():
    p = ROOT / f"{loc}.json"
    ins, skp = insert_at(p, keys)
    print(f"{loc}: +{ins} inserted, {skp} already present")
    total_ins += ins
print(f"TOTAL inserted: {total_ins}")