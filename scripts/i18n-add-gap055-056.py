#!/usr/bin/env python3
"""Add 8 new i18n keys (4 a11y.aria + 4 placeholder) × 5 locales for gap-055/gap-056."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NEW = {
    'a11y.aria.change_language': {
        'pt-PT': 'Mudar idioma — actual: {native}',
        'en': 'Change language — current: {native}',
        'fr': 'Changer de langue — actuelle : {native}',
        'ar': 'تغيير اللغة — الحالية: {native}',
        'tn': 'Badel lougha — actuali: {native}',
    },
    'a11y.aria.choose_language': {
        'pt-PT': 'Escolher idioma',
        'en': 'Choose language',
        'fr': 'Choisir la langue',
        'ar': 'اختر اللغة',
        'tn': 'Ikhtar lougha',
    },
    'a11y.aria.progresso_de': {
        'pt-PT': 'Progresso de {label}: {percent}%',
        'en': 'Progress of {label}: {percent}%',
        'fr': 'Progression de {label} : {percent}%',
        'ar': 'تقدّم {label}: {percent}٪',
        'tn': 'Taqaddom {label}: {percent}%',
    },
    'a11y.aria.disponivel_em_breve': {
        'pt-PT': 'Disponível em breve',
        'en': 'Coming soon',
        'fr': 'Bientôt disponible',
        'ar': 'قريباً',
        'tn': 'Ghi jay',
    },
    'placeholder.zero_zero': {
        'pt-PT': '0,00',
        'en': '0.00',
        'fr': '0,00',
        'ar': '0.00',
        'tn': '0.00',
    },
    'placeholder.em_dash': {
        'pt-PT': '—',
        'en': '—',
        'fr': '—',
        'ar': '—',
        'tn': '—',
    },
    'placeholder.emoji_check': {
        'pt-PT': '✅',
        'en': '✅',
        'fr': '✅',
        'ar': '✅',
        'tn': '✅',
    },
    'placeholder.limite_para': {
        'pt-PT': 'Limite para {nome}',
        'en': 'Limit for {nome}',
        'fr': 'Limite pour {nome}',
        'ar': 'حدّ لـ {nome}',
        'tn': 'Hadd l-{nome}',
    },
}

for loc in ['pt-PT', 'en', 'fr', 'ar', 'tn']:
    path = os.path.join(ROOT, 'src', 'lib', 'i18n', f'{loc}.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if 'a11y' not in data:
        data['a11y'] = {}
    if 'aria' not in data['a11y']:
        data['a11y']['aria'] = {}
    if 'placeholder' not in data:
        data['placeholder'] = {}
    for full_key, table in NEW.items():
        if full_key.startswith('a11y.aria.'):
            short = full_key.split('.', 2)[2]
            data['a11y']['aria'][short] = table[loc]
        elif full_key.startswith('placeholder.'):
            short = full_key.split('.', 1)[1]
            data['placeholder'][short] = table[loc]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    aria_n = len(data['a11y']['aria'])
    plh_n = len(data['placeholder'])
    print(f'{loc}: a11y.aria={aria_n}, placeholder={plh_n}')
print('DONE')