import json
from pathlib import Path

i18n_dir = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n")

# Define the new keys for each locale
new_keys = {
    "hub.app.escola.name":            {"pt-PT": "Escola",       "en": "School",        "fr": "École",         "tn": "L'ecole",       "ar": "المدرسة"},
    "hub.app.escola.description":     {"pt-PT": "Cursos, lições e quizzes", "en": "Courses, lessons and quizzes", "fr": "Cours, lecons et quiz", "tn": "Cours, lecons w quiz", "ar": "دروس ودورات واختبارات"},
    "hub.app.trabalhos.name":         {"pt-PT": "Trabalhos",    "en": "Assignments",   "fr": "Devoirs",       "tn": "Les devoirs",   "ar": "الواجبات"},
    "hub.app.trabalhos.description":  {"pt-PT": "Trabalhos e entregas com prazos", "en": "Assignments and deliverables with deadlines", "fr": "Devoirs et rendus avec echeances", "tn": "Devoirs w delais", "ar": "الواجبات والتسليمات مع المواعيد"},
    "hub.app.financas.name":          {"pt-PT": "Finanças",     "en": "Finance",       "fr": "Finances",      "tn": "Flous",         "ar": "المالية"},
    "hub.app.financas.description":   {"pt-PT": "Transações, orçamento e categorias", "en": "Transactions, budget and categories", "fr": "Transactions, budget et categories", "tn": "Transactions, budget w categories", "ar": "المعاملات والميزانية والفئات"},
    "hub.app.habitos.name":           {"pt-PT": "Hábitos",      "en": "Habits",        "fr": "Habitudes",     "tn": "Les habitudes", "ar": "العادات"},
    "hub.app.habitos.description":    {"pt-PT": "Hábitos diários com streaks", "en": "Daily habits with streaks", "fr": "Habitudes quotidiennes avec series", "tn": "Habitudes quotidien w series", "ar": "العادات اليومية مع السلاسل"},
    "hub.app.biblioteca.name":        {"pt-PT": "Biblioteca",   "en": "Library",       "fr": "Bibliotheque",  "tn": "La bibliotheque","ar": "المكتبة"},
    "hub.app.biblioteca.description": {"pt-PT": "Bookmarks, links e referências", "en": "Bookmarks, links and references", "fr": "Signets, liens et references", "tn": "Signets, liens w references", "ar": "الإشارات المرجعية والروابط"},
    "hub.legacy.name":                {"pt-PT": "Site V3",      "en": "Site V3",       "fr": "Site V3",       "tn": "Site V3",       "ar": "موقع V3"},
    "hub.legacy.description":         {"pt-PT": "O site original (preservado)", "en": "The original site (preserved)", "fr": "Le site original (preserve)", "tn": "Le site original (preserve)", "ar": "الموقع الأصلي (محفوظ)"},
}

# Patch each language file
for lang in ["pt-PT", "en", "fr", "tn", "ar"]:
    f = i18n_dir / f"{lang}.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    added = 0
    for k, translations in new_keys.items():
        if k not in d:
            d[k] = translations[lang]
            added += 1
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{lang}.json: +{added} keys, total now {len(d)}")

print("DONE")
