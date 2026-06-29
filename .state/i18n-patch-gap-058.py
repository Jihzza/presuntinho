#!/usr/bin/env python3
"""Add 9 new i18n keys × 5 locales for gap-058 (PT hardcoded UI strings).

Keys to add (pt-PT original strings from grep audit):
- walkthrough.audio.title: "Audio walkthrough"
- walkthrough.audio.missing: "Sem ficheiro de áudio para esta lição."
- habitos.novo.sub: "Define um hábito diário para acompanhares com streaks."
- habitos.novo.iconHint: "Emoji curto (até 4 caracteres)."
- financas.orcamento.sub: "Limites por categoria — {mes}"
- financas.orcamento.empty: "Sem categorias de despesa configuradas."
- financas.transacoes.filtros.pesquisar: "Pesquisar"
- financas.transacoes.filtros.de: "De"
- financas.transacoes.filtros.ate: "Até"
"""
import json
from pathlib import Path

BASE = Path("src/lib/i18n")

# Translations for each locale. Format: key → value
TRANSLATIONS = {
    "pt-PT": {
        "walkthrough.audio.title": "Audio walkthrough",
        "walkthrough.audio.missing": "Sem ficheiro de áudio para esta lição.",
        "habitos.novo.sub": "Define um hábito diário para acompanhares com streaks.",
        "habitos.novo.iconHint": "Emoji curto (até 4 caracteres).",
        "financas.orcamento.sub": "Limites por categoria — {mes}",
        "financas.orcamento.empty": "Sem categorias de despesa configuradas.",
        "financas.transacoes.filtros.pesquisar": "Pesquisar",
        "financas.transacoes.filtros.de": "De",
        "financas.transacoes.filtros.ate": "Até",
    },
    "en": {
        "walkthrough.audio.title": "Audio walkthrough",
        "walkthrough.audio.missing": "No audio file for this lesson.",
        "habitos.novo.sub": "Define a daily habit to track with streaks.",
        "habitos.novo.iconHint": "Short emoji (up to 4 characters).",
        "financas.orcamento.sub": "Category limits — {mes}",
        "financas.orcamento.empty": "No expense categories configured.",
        "financas.transacoes.filtros.pesquisar": "Search",
        "financas.transacoes.filtros.de": "From",
        "financas.transacoes.filtros.ate": "To",
    },
    "fr": {
        "walkthrough.audio.title": "Walkthrough audio",
        "walkthrough.audio.missing": "Pas de fichier audio pour cette leçon.",
        "habitos.novo.sub": "Définis une habitude quotidienne à suivre avec des séries.",
        "habitos.novo.iconHint": "Emoji court (jusqu'à 4 caractères).",
        "financas.orcamento.sub": "Limites par catégorie — {mes}",
        "financas.orcamento.empty": "Aucune catégorie de dépenses configurée.",
        "financas.transacoes.filtros.pesquisar": "Rechercher",
        "financas.transacoes.filtros.de": "De",
        "financas.transacoes.filtros.ate": "À",
    },
    "tn": {
        "walkthrough.audio.title": "Audio walkthrough",
        "walkthrough.audio.missing": "Makan fichier audio l hadhi l-derja.",
        "habitos.novo.sub": "Defini 'adet youmi bsh ttab3ou b des séries.",
        "habitos.novo.iconHint": "Emoji qsir (7ta 4 7rouf).",
        "financas.orcamento.sub": "L7oudod par catégorie — {mes}",
        "financas.orcamento.empty": "Makan katégories de dépenses configurés.",
        "financas.transacoes.filtros.pesquisar": "9alleb",
        "financas.transacoes.filtros.de": "Men",
        "financas.transacoes.filtros.ate": "7ta",
    },
    "ar": {
        "walkthrough.audio.title": "شرح صوتي",
        "walkthrough.audio.missing": "لا يوجد ملف صوتي لهذا الدرس.",
        "habitos.novo.sub": "حدد عادة يومية لتتبعها مع سلاسل.",
        "habitos.novo.iconHint": "رمز قصير (حتى 4 أحرف).",
        "financas.orcamento.sub": "حدود الفئات — {mes}",
        "financas.orcamento.empty": "لا توجد فئات نفقات مُكوَّنة.",
        "financas.transacoes.filtros.pesquisar": "بحث",
        "financas.transacoes.filtros.de": "من",
        "financas.transacoes.filtros.ate": "إلى",
    },
}

# Load each locale, merge keys, save.
for locale, keys_to_add in TRANSLATIONS.items():
    p = BASE / f"{locale}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    added = []
    for k, v in keys_to_add.items():
        if k not in data:
            data[k] = v
            added.append(k)
    if added:
        # Re-write preserving 2-space indent + ASCII
        p.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    print(f"{locale}: added {len(added)} keys: {added}")

# Verify all 5 locales have all 9 keys
required = list(TRANSLATIONS["pt-PT"].keys())
print("---verification---")
for locale in ["pt-PT", "en", "fr", "tn", "ar"]:
    p = BASE / f"{locale}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    missing = [k for k in required if k not in data]
    print(f"{locale}: missing={missing}, total_keys={len(data)}")