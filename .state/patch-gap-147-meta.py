#!/usr/bin/env python3
"""
gap-147: Replace PT-hardcoded <meta> description/og/twitter tags with $t() lookups.
Adds routes.{biblioteca,escola,financas,habitos,trabalhos,financas.relatorios}.meta.* keys
across all 5 locales (pt-PT, en, tn, fr, ar).

Keys added (per area):
  - description
  - og_title
  - og_description
  - twitter_title
  - twitter_description

Total: 27 keys × 5 locales = 135 entries.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Source language values (PT)
PT = {
    'routes.biblioteca.meta.description': 'Bookmarks, links e referências com tags',
    'routes.biblioteca.meta.og_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.og_description': 'Bookmarks, links e referências com tags',
    'routes.biblioteca.meta.twitter_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.twitter_description': 'Bookmarks, links e referências com tags',
    'routes.escola.meta.description': 'Cursos, lições e quizzes da Fatma',
    'routes.escola.meta.og_title': 'Escola · Cursos e Quizzes',
    'routes.escola.meta.og_description': 'Cursos, lições e quizzes da Fatma',
    'routes.escola.meta.twitter_title': 'Escola · Cursos e Quizzes',
    'routes.escola.meta.twitter_description': 'Cursos, lições e quizzes da Fatma',
    'routes.financas.meta.description': 'Transações, orçamento e categorias',
    'routes.financas.meta.og_title': 'Finanças · Dashboard',
    'routes.financas.meta.og_description': 'Transações, orçamento e categorias',
    'routes.financas.meta.twitter_title': 'Finanças · Dashboard',
    'routes.financas.meta.twitter_description': 'Transações, orçamento e categorias',
    'routes.financas.relatorios.meta.og_title': 'Relatórios · Finanças',
    'routes.financas.relatorios.meta.twitter_title': 'Relatórios · Finanças',
    'routes.habitos.meta.description': 'Hábitos diários com streaks',
    'routes.habitos.meta.og_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.og_description': 'Hábitos diários com streaks',
    'routes.habitos.meta.twitter_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.twitter_description': 'Hábitos diários com streaks',
    'routes.trabalhos.meta.description': 'Trabalhos e entregas com prazos',
    'routes.trabalhos.meta.og_title': 'Trabalhos · Entregas e Prazos',
    'routes.trabalhos.meta.og_description': 'Trabalhos e entregas com prazos',
    'routes.trabalhos.meta.twitter_title': 'Trabalhos · Entregas e Prazos',
    'routes.trabalhos.meta.twitter_description': 'Trabalhos e entregas com prazos',
}

EN = {
    'routes.biblioteca.meta.description': 'Bookmarks, links and references with tags',
    'routes.biblioteca.meta.og_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.og_description': 'Bookmarks, links and references with tags',
    'routes.biblioteca.meta.twitter_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.twitter_description': 'Bookmarks, links and references with tags',
    'routes.escola.meta.description': "Fatma's courses, lessons and quizzes",
    'routes.escola.meta.og_title': 'School · Courses and Quizzes',
    'routes.escola.meta.og_description': "Fatma's courses, lessons and quizzes",
    'routes.escola.meta.twitter_title': 'School · Courses and Quizzes',
    'routes.escola.meta.twitter_description': "Fatma's courses, lessons and quizzes",
    'routes.financas.meta.description': 'Transactions, budget and categories',
    'routes.financas.meta.og_title': 'Finanças · Dashboard',
    'routes.financas.meta.og_description': 'Transactions, budget and categories',
    'routes.financas.meta.twitter_title': 'Finanças · Dashboard',
    'routes.financas.meta.twitter_description': 'Transactions, budget and categories',
    'routes.financas.relatorios.meta.og_title': 'Reports · Finanças',
    'routes.financas.relatorios.meta.twitter_title': 'Reports · Finanças',
    'routes.habitos.meta.description': 'Daily habits with streaks',
    'routes.habitos.meta.og_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.og_description': 'Daily habits with streaks',
    'routes.habitos.meta.twitter_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.twitter_description': 'Daily habits with streaks',
    'routes.trabalhos.meta.description': 'Assignments and submissions with deadlines',
    'routes.trabalhos.meta.og_title': 'Trabalhos · Submissions and Deadlines',
    'routes.trabalhos.meta.og_description': 'Assignments and submissions with deadlines',
    'routes.trabalhos.meta.twitter_title': 'Trabalhos · Submissions and Deadlines',
    'routes.trabalhos.meta.twitter_description': 'Assignments and submissions with deadlines',
}

# Tunisian (latin transliteration)
TN = {
    'routes.biblioteca.meta.description': 'Bookmarks, links w références b les tags',
    'routes.biblioteca.meta.og_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.og_description': 'Bookmarks, links w références b les tags',
    'routes.biblioteca.meta.twitter_title': 'Biblioteca · Bookmarks',
    'routes.biblioteca.meta.twitter_description': 'Bookmarks, links w références b les tags',
    'routes.escola.meta.description': 'Cours, leçons w quizzes taa Fatma',
    'routes.escola.meta.og_title': 'Escola · Cours w Quizzes',
    'routes.escola.meta.og_description': 'Cours, leçons w quizzes taa Fatma',
    'routes.escola.meta.twitter_title': 'Escola · Cours w Quizzes',
    'routes.escola.meta.twitter_description': 'Cours, leçons w quizzes taa Fatma',
    'routes.financas.meta.description': 'Transactions, budget w catégories',
    'routes.financas.meta.og_title': 'Finanças · Dashboard',
    'routes.financas.meta.og_description': 'Transactions, budget w catégories',
    'routes.financas.meta.twitter_title': 'Finanças · Dashboard',
    'routes.financas.meta.twitter_description': 'Transactions, budget w catégories',
    'routes.financas.relatorios.meta.og_title': 'Rapports · Finanças',
    'routes.financas.relatorios.meta.twitter_title': 'Rapports · Finanças',
    'routes.habitos.meta.description': 'Habits taa koll nhar b streaks',
    'routes.habitos.meta.og_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.og_description': 'Habits taa koll nhar b streaks',
    'routes.habitos.meta.twitter_title': 'Hábitos · Daily Check-in',
    'routes.habitos.meta.twitter_description': 'Habits taa koll nhar b streaks',
    'routes.trabalhos.meta.description': 'Travaux w livrables b les délais',
    'routes.trabalhos.meta.og_title': 'Trabalhos · Livraisons w Délais',
    'routes.trabalhos.meta.og_description': 'Travaux w livrables b les délais',
    'routes.trabalhos.meta.twitter_title': 'Trabalhos · Livraisons w Délais',
    'routes.trabalhos.meta.twitter_description': 'Travaux w livrables b les délais',
}

FR = {
    'routes.biblioteca.meta.description': 'Signets, liens et références avec étiquettes',
    'routes.biblioteca.meta.og_title': 'Biblioteca · Signets',
    'routes.biblioteca.meta.og_description': 'Signets, liens et références avec étiquettes',
    'routes.biblioteca.meta.twitter_title': 'Biblioteca · Signets',
    'routes.biblioteca.meta.twitter_description': 'Signets, liens et références avec étiquettes',
    'routes.escola.meta.description': 'Cours, leçons et quiz de Fatma',
    'routes.escola.meta.og_title': 'École · Cours et Quiz',
    'routes.escola.meta.og_description': 'Cours, leçons et quiz de Fatma',
    'routes.escola.meta.twitter_title': 'École · Cours et Quiz',
    'routes.escola.meta.twitter_description': 'Cours, leçons et quiz de Fatma',
    'routes.financas.meta.description': 'Transactions, budget et catégories',
    'routes.financas.meta.og_title': 'Finanças · Tableau de bord',
    'routes.financas.meta.og_description': 'Transactions, budget et catégories',
    'routes.financas.meta.twitter_title': 'Finanças · Tableau de bord',
    'routes.financas.meta.twitter_description': 'Transactions, budget et catégories',
    'routes.financas.relatorios.meta.og_title': 'Rapports · Finanças',
    'routes.financas.relatorios.meta.twitter_title': 'Rapports · Finanças',
    'routes.habitos.meta.description': 'Habitudes quotidiennes avec séries',
    'routes.habitos.meta.og_title': 'Hábitos · Bilan quotidien',
    'routes.habitos.meta.og_description': 'Habitudes quotidiennes avec séries',
    'routes.habitos.meta.twitter_title': 'Hábitos · Bilan quotidien',
    'routes.habitos.meta.twitter_description': 'Habitudes quotidiennes avec séries',
    'routes.trabalhos.meta.description': 'Devoirs et livraisons avec délais',
    'routes.trabalhos.meta.og_title': 'Trabalhos · Livraisons et Délais',
    'routes.trabalhos.meta.og_description': 'Devoirs et livraisons avec délais',
    'routes.trabalhos.meta.twitter_title': 'Trabalhos · Livraisons et Délais',
    'routes.trabalhos.meta.twitter_description': 'Devoirs et livraisons avec délais',
}

# Arabic (RTL)
AR = {
    'routes.biblioteca.meta.description': 'إشارات مرجعية وروابط ومراجع مع وسوم',
    'routes.biblioteca.meta.og_title': 'Biblioteca · الإشارات المرجعية',
    'routes.biblioteca.meta.og_description': 'إشارات مرجعية وروابط ومراجع مع وسوم',
    'routes.biblioteca.meta.twitter_title': 'Biblioteca · الإشارات المرجعية',
    'routes.biblioteca.meta.twitter_description': 'إشارات مرجعية وروابط ومراجع مع وسوم',
    'routes.escola.meta.description': 'دروس فاتما ودروس ومحاكاة واختبارات',
    'routes.escola.meta.og_title': 'المدرسة · الدروس والاختبارات',
    'routes.escola.meta.og_description': 'دروس فاتما ودروس ومحاكاة واختبارات',
    'routes.escola.meta.twitter_title': 'المدرسة · الدروس والاختبارات',
    'routes.escola.meta.twitter_description': 'دروس فاتما ودروس ومحاكاة واختبارات',
    'routes.financas.meta.description': 'المعاملات والميزانية والفئات',
    'routes.financas.meta.og_title': 'Finanças · لوحة التحكم',
    'routes.financas.meta.og_description': 'المعاملات والميزانية والفئات',
    'routes.financas.meta.twitter_title': 'Finanças · لوحة التحكم',
    'routes.financas.meta.twitter_description': 'المعاملات والميزانية والفئات',
    'routes.financas.relatorios.meta.og_title': 'التقارير · Finanças',
    'routes.financas.relatorios.meta.twitter_title': 'التقارير · Finanças',
    'routes.habitos.meta.description': 'عادات يومية مع سلاسل',
    'routes.habitos.meta.og_title': 'Hábitos · تسجيل يومي',
    'routes.habitos.meta.og_description': 'عادات يومية مع سلاسل',
    'routes.habitos.meta.twitter_title': 'Hábitos · تسجيل يومي',
    'routes.habitos.meta.twitter_description': 'عادات يومية مع سلاسل',
    'routes.trabalhos.meta.description': 'وظائف وتسليمات مع مواعيد نهائية',
    'routes.trabalhos.meta.og_title': 'Trabalhos · التسليمات والمواعيد',
    'routes.trabalhos.meta.og_description': 'وظائف وتسليمات مع مواعيد نهائية',
    'routes.trabalhos.meta.twitter_title': 'Trabalhos · التسليمات والمواعيد',
    'routes.trabalhos.meta.twitter_description': 'وظائف وتسليمات مع مواعيد نهائية',
}

LOCALE_DATA = {
    'pt-PT': PT,
    'en': EN,
    'tn': TN,
    'fr': FR,
    'ar': AR,
}


def set_nested(d, dotted_key, value):
    """Set a nested key like 'routes.biblioteca.meta.description' in dict d."""
    parts = dotted_key.split('.')
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur.get(p), dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def count_keys(o):
    if isinstance(o, dict):
        return sum(count_keys(v) for v in o.values())
    return 1


def main():
    print(f"== gap-147 meta i18n ==")
    print(f"Adding 27 keys × 5 locales = 135 entries")
    print()
    for locale, data in LOCALE_DATA.items():
        path = os.path.join(ROOT, f'src/lib/i18n/{locale}.json')
        with open(path, encoding='utf-8') as f:
            d = json.load(f)
        before = count_keys(d)
        for k, v in data.items():
            set_nested(d, k, v)
        after = count_keys(d)
        # Write back
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
            f.write('\n')
        delta = after - before
        print(f"  {locale}: {before} → {after} (+{delta})")
    print()
    # Parity check
    print("== Parity check ==")
    counts = {}
    for loc in LOCALE_DATA:
        path = os.path.join(ROOT, f'src/lib/i18n/{loc}.json')
        with open(path) as f:
            counts[loc] = count_keys(json.load(f))
    ref = counts['pt-PT']
    for loc, k in counts.items():
        status = 'PARITY' if k == ref else f'DRIFT {k-ref:+d}'
        print(f"  {loc}: {k} {status}")


if __name__ == '__main__':
    main()