#!/usr/bin/env python3
"""Add 7 new i18n keys × 5 locales for gap-059/060/061 (PT hardcoded UI strings).

Keys to add:
- trabalhos.assignment.o_que_fazer: "O que fazer"
- trabalhos.assignment.prazo: "Prazo"
- trabalhos.assignment.recursos: "Recursos"
- habitos.streak.atual: "Streak atual"
- habitos.streak.nos_ultimos: "nos últimos 90 dias"
- financas.orcamento.mes_label: "Mês"
- financas.orcamento.carregando: "A carregar…"
"""
import json
from pathlib import Path

BASE = Path("src/lib/i18n")

TRANSLATIONS = {
    "pt-PT": {
        "trabalhos.assignment.o_que_fazer": "O que fazer",
        "trabalhos.assignment.prazo": "Prazo",
        "trabalhos.assignment.recursos": "Recursos",
        "habitos.streak.atual": "Streak atual",
        "habitos.streak.nos_ultimos": "nos últimos 90 dias",
        "financas.orcamento.mes_label": "Mês",
        "financas.orcamento.carregando": "A carregar…",
    },
    "en": {
        "trabalhos.assignment.o_que_fazer": "What to do",
        "trabalhos.assignment.prazo": "Deadline",
        "trabalhos.assignment.recursos": "Resources",
        "habitos.streak.atual": "Current streak",
        "habitos.streak.nos_ultimos": "in the last 90 days",
        "financas.orcamento.mes_label": "Month",
        "financas.orcamento.carregando": "Loading…",
    },
    "fr": {
        "trabalhos.assignment.o_que_fazer": "À faire",
        "trabalhos.assignment.prazo": "Échéance",
        "trabalhos.assignment.recursos": "Ressources",
        "habitos.streak.atual": "Série actuelle",
        "habitos.streak.nos_ultimos": "au cours des 90 derniers jours",
        "financas.orcamento.mes_label": "Mois",
        "financas.orcamento.carregando": "Chargement…",
    },
    "tn": {
        "trabalhos.assignment.o_que_fazer": "Chnowa t3mel",
        "trabalhos.assignment.prazo": "Date limite",
        "trabalhos.assignment.recursos": "Mawad",
        "habitos.streak.atual": "Série actuelle",
        "habitos.streak.nos_ultimos": "fi les 90 youm li fatou",
        "financas.orcamento.mes_label": "Chhor",
        "financas.orcamento.carregando": "Am tsena…",
    },
    "ar": {
        "trabalhos.assignment.o_que_fazer": "ما يجب فعله",
        "trabalhos.assignment.prazo": "الموعد النهائي",
        "trabalhos.assignment.recursos": "الموارد",
        "habitos.streak.atual": "السلسلة الحالية",
        "habitos.streak.nos_ultimos": "في آخر 90 يوماً",
        "financas.orcamento.mes_label": "الشهر",
        "financas.orcamento.carregando": "جارٍ التحميل…",
    },
}

for locale, keys_to_add in TRANSLATIONS.items():
    p = BASE / f"{locale}.json"
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    # Add new keys (last position)
    data.update(keys_to_add)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{locale}: added {len(keys_to_add)} keys")

print("OK — 7 keys × 5 locales = 35 entries")