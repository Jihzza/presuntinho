"""gap-022: add i18n keys for PT body strings still hardcoded in routes.
Keys: case.breadcrumb.home, case.breadcrumb.current, case.h2.{forces,divain},
case.forces.h3.{forces,weaknesses}, case.kpi.lost, case.subtitle, etc.

Adds ~50 new keys across 5 locales = 250 entries.
"""
import json
from pathlib import Path

i18n_dir = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n")

# Each value is {pt-PT, en, fr, tn, ar}
new_keys = {
    # === Case route ===
    "case.breadcrumb.home":          {"pt-PT": "← Hub",        "en": "← Hub",          "fr": "← Hub",        "tn": "← Hub",      "ar": "← المحور"},
    "case.breadcrumb.current":       {"pt-PT": "Case",         "en": "Case Study",     "fr": "Étude de cas", "tn": "Case",       "ar": "دراسة حالة"},
    "case.h1":                       {"pt-PT": "📊 Equivalenza: Deep Dive", "en": "📊 Equivalenza: Deep Dive", "fr": "📊 Equivalenza : analyse approfondie", "tn": "📊 Equivalenza: Deep Dive", "ar": "📊 Equivalenza: تحليل معمّق"},
    "case.subtitle":                 {"pt-PT": "Tudo o que precisas saber sobre a empresa, o mercado e a concorrência.", "en": "Everything you need to know about the company, the market and the competition.", "fr": "Tout ce qu'il faut savoir sur l'entreprise, le marché et la concurrence.", "tn": "Kolshi lazem ta3ref 3al company, le marché w la concurrence.", "ar": "كل ما تحتاج معرفته عن الشركة والسوق والمنافسة."},
    "case.tag.modulo":               {"pt-PT": "Módulo 1",     "en": "Module 1",       "fr": "Module 1",     "tn": "Module 1",   "ar": "الوحدة 1"},
    "case.h2.overview":              {"pt-PT": "📋 Visão geral da empresa", "en": "📋 Company overview", "fr": "📋 Vue d'ensemble de l'entreprise", "tn": "📋 Aperçu général", "ar": "📋 نظرة عامة على الشركة"},
    "case.h2.decline":               {"pt-PT": "📉 O declínio", "en": "📉 The decline",  "fr": "📉 Le déclin",  "tn": "📉 Le déclin","ar": "📉 التراجع"},
    "case.kpi.lost":                 {"pt-PT": "Lojas perdidas até 2023", "en": "Stores lost by 2023", "fr": "Magasins perdus jusqu'en 2023", "tn": "Magasins perdus 7ata 2023", "ar": "المتاجر المفقودة حتى 2023"},
    "case.h2.forces":                {"pt-PT": "🎯 As três forças", "en": "🎯 The three forces", "fr": "🎯 Les trois forces", "tn": "🎯 Les trois forces", "ar": "🎯 القوى الثلاث"},
    "case.h2.divain":                {"pt-PT": "🏢 Concorrente: Divain", "en": "🏢 Competitor: Divain", "fr": "🏢 Concurrent : Divain", "tn": "🏢 Concurrent: Divain", "ar": "🏢 المنافس: Divain"},
    "case.divain.why":               {"pt-PT": "Porquê esta escolha:", "en": "Why this choice:", "fr": "Pourquoi ce choix :", "tn": "Pourquoi cette choix:", "ar": "لماذا هذا الاختيار:"},
    "case.divain.why.text":          {"pt-PT": "a ameaça estrutural mais directa. Mesmo price point (€15-30). Modelo digital-first.", "en": "the most direct structural threat. Same price point (€15-30). Digital-first model.", "fr": "la menace structurelle la plus directe. Même price point (€15-30). Modèle digital-first.", "tn": "la menace structurelle la plus directe. Même prix (€15-30). Modèle digital-first.", "ar": "التهديد الهيكلي الأكثر مباشرة. نفس مستوى السعر (15-30€). نموذج رقمي أولاً."},
    "case.h3.strengths":             {"pt-PT": "Forças",        "en": "Strengths",       "fr": "Forces",       "tn": "Les forces",   "ar": "نقاط القوة"},
    "case.h3.weaknesses":            {"pt-PT": "Fraquezas",     "en": "Weaknesses",      "fr": "Faiblesses",   "tn": "Les faiblesses","ar": "نقاط الضعف"},
    "case.h2.persona":               {"pt-PT": "👤 The Discerning Explorer", "en": "👤 The Discerning Explorer", "fr": "👤 L'explorateur éclairé", "tn": "👤 The Discerning Explorer", "ar": "👤 المستكشف المميّز"},
    # === Curso PT route (escola/curso/portugues) ===
    "escola.curso.pt.breadcrumb.home":   {"pt-PT": "← Escola", "en": "← School",  "fr": "← École",    "tn": "← L'ecole",  "ar": "← المدرسة"},
    "escola.curso.pt.breadcrumb.current":{"pt-PT": "Curso PT", "en": "PT Course", "fr": "Cours PT",  "tn": "Cours PT",   "ar": "دورة PT"},
    "escola.curso.pt.verify.text":       {"pt-PT": "Verifica que o ficheiro", "en": "Check that the file", "fr": "Vérifie que le fichier", "tn": "Vérifie que le fichier", "ar": "تأكد من وجود الملف"},
    "escola.curso.pt.verify.exists":     {"pt-PT": "existe.", "en": "exists.", "fr": "existe.", "tn": "existe.", "ar": "موجود."},
    "escola.curso.pt.th.vowel":          {"pt-PT": "Vogal", "en": "Vowel", "fr": "Voyelle", "tn": "Voyelle", "ar": "حرف العلة"},
    "escola.curso.pt.th.ipa":            {"pt-PT": "IPA", "en": "IPA", "fr": "API", "tn": "IPA", "ar": "الألفبائية الصوتية"},
    "escola.curso.pt.th.trick":          {"pt-PT": "Truque", "en": "Trick", "fr": "Astuce", "tn": "Astuce", "ar": "حيلة"},
    "escola.curso.pt.h3.examples":       {"pt-PT": "Exemplos", "en": "Examples", "fr": "Exemples", "tn": "Exemples", "ar": "أمثلة"},
    # === Escola walkthrough ===
    "walkthrough.breadcrumb.home":       {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "walkthrough.breadcrumb.escola":     {"pt-PT": "Escola", "en": "School", "fr": "École", "tn": "L'ecole", "ar": "المدرسة"},
    "walkthrough.breadcrumb.curso":      {"pt-PT": "Equivalenza", "en": "Equivalenza", "fr": "Equivalenza", "tn": "Equivalenza", "ar": "Equivalenza"},
    "walkthrough.breadcrumb.current":    {"pt-PT": "Walkthrough", "en": "Walkthrough", "fr": "Walkthrough", "tn": "Walkthrough", "ar": "جولة"},
    "walkthrough.verify.text":           {"pt-PT": "Verifica que", "en": "Check that", "fr": "Vérifie que", "tn": "Vérifie que", "ar": "تأكد من"},
    "walkthrough.verify.exists":         {"pt-PT": "existe.", "en": "exists.", "fr": "existe.", "tn": "existe.", "ar": "موجود."},
    "walkthrough.audio.download":        {"pt-PT": "Descarregar áudio", "en": "Download audio", "fr": "Télécharger l'audio", "tn": "Télécharger audio", "ar": "تنزيل الصوت"},
    # === Escola quiz ===
    "escola.quiz.breadcrumb.home":       {"pt-PT": "← Escola", "en": "← School", "fr": "← École", "tn": "← L'ecole", "ar": "← المدرسة"},
    "escola.quiz.breadcrumb.current":    {"pt-PT": "Quiz", "en": "Quiz", "fr": "Quiz", "tn": "Quiz", "ar": "اختبار"},
    "escola.quiz.breadcrumb.curso":      {"pt-PT": "Equivalenza", "en": "Equivalenza", "fr": "Equivalenza", "tn": "Equivalenza", "ar": "Equivalenza"},
    # === Escola curso slug ===
    "escola.curso.slug.tag":             {"pt-PT": "Curso", "en": "Course", "fr": "Cours", "tn": "Cours", "ar": "دورة"},
    # === dl route ===
    "dl.breadcrumb.home":                {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "dl.breadcrumb.current":             {"pt-PT": "Downloads", "en": "Downloads", "fr": "Téléchargements", "tn": "Téléchargements", "ar": "التنزيلات"},
    # === course route ===
    "course.breadcrumb.home":            {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "course.breadcrumb.current":         {"pt-PT": "Course", "en": "Course", "fr": "Cours", "tn": "Cours", "ar": "دورة"},
    # === secrets ===
    "secrets.breadcrumb.home":           {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "secrets.breadcrumb.current":        {"pt-PT": "Secrets", "en": "Secrets", "fr": "Secrets", "tn": "Secrets", "ar": "أسرار"},
    "secrets.locked":                    {"pt-PT": "Bloqueado", "en": "Locked", "fr": "Verrouillé", "tn": "Verrouillé", "ar": "مقفل"},
    # === walk (legacy) ===
    "walk.breadcrumb.home":              {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "walk.breadcrumb.current":           {"pt-PT": "Walkthrough", "en": "Walkthrough", "fr": "Walkthrough", "tn": "Walkthrough", "ar": "جولة"},
    # === write (legacy) ===
    "write.breadcrumb.home":             {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    # === biblioteca item + novo ===
    "biblioteca.item.breadcrumb.home":   {"pt-PT": "← Hub", "en": "← Hub", "fr": "← Hub", "tn": "← Hub", "ar": "← المحور"},
    "biblioteca.item.breadcrumb.current":{"pt-PT": "Biblioteca", "en": "Library", "fr": "Bibliothèque", "tn": "La bibliotheque", "ar": "المكتبة"},
    "biblioteca.item.label.tags":        {"pt-PT": "Tags", "en": "Tags", "fr": "Tags", "tn": "Tags", "ar": "وسوم"},
    "biblioteca.item.label.notes":       {"pt-PT": "Notas", "en": "Notes", "fr": "Notes", "tn": "Notes", "ar": "ملاحظات"},
    "biblioteca.item.action.open":       {"pt-PT": "Abrir", "en": "Open", "fr": "Ouvrir", "tn": "Ouvrir", "ar": "فتح"},
    "biblioteca.item.action.edit":       {"pt-PT": "Editar", "en": "Edit", "fr": "Modifier", "tn": "Modifier", "ar": "تحرير"},
    "biblioteca.item.action.delete":     {"pt-PT": "Apagar", "en": "Delete", "fr": "Supprimer", "tn": "Supprimer", "ar": "حذف"},
    "biblioteca.novo.breadcrumb.home":   {"pt-PT": "← Biblioteca", "en": "← Library", "fr": "← Bibliothèque", "tn": "← La bibliotheque", "ar": "← المكتبة"},
    "biblioteca.novo.breadcrumb.current":{"pt-PT": "Novo", "en": "New", "fr": "Nouveau", "tn": "Nouveau", "ar": "جديد"},
    "biblioteca.novo.label.tags":        {"pt-PT": "Tags", "en": "Tags", "fr": "Tags", "tn": "Tags", "ar": "وسوم"},
    "biblioteca.novo.action.cancel":     {"pt-PT": "Cancelar", "en": "Cancel", "fr": "Annuler", "tn": "Annuler", "ar": "إلغاء"},
    "biblioteca.novo.notes.placeholder": {"pt-PT": "Notas pessoais, porquê que guardaste, capítulos a ler…", "en": "Personal notes, why you saved it, chapters to read…", "fr": "Notes personnelles, pourquoi tu l'as gardé, chapitres à lire…", "tn": "Notes personnelles, pour quoi t'as gardé, chapitres à lire…", "ar": "ملاحظات شخصية، لماذا حفظته، فصول للقراءة…"},
    # === finanças ===
    "financas.orcamento.breadcrumb.home":   {"pt-PT": "← Finanças", "en": "← Finance", "fr": "← Finances", "tn": "← Flous", "ar": "← المالية"},
    "financas.nova.breadcrumb.home":        {"pt-PT": "← Finanças", "en": "← Finance", "fr": "← Finances", "tn": "← Flous", "ar": "← المالية"},
    "financas.transacoes.breadcrumb.home":  {"pt-PT": "← Finanças", "en": "← Finance", "fr": "← Finances", "tn": "← Flous", "ar": "← المالية"},
    "financas.transacoes.filter.all":       {"pt-PT": "Todas", "en": "All", "fr": "Toutes", "tn": "Toutes", "ar": "الكل"},
    # === hábitos ===
    "habitos.habit.breadcrumb.home":        {"pt-PT": "← Hábitos", "en": "← Habits", "fr": "← Habitudes", "tn": "← Les habitudes", "ar": "← العادات"},
    "habitos.novo.breadcrumb.home":         {"pt-PT": "← Hábitos", "en": "← Habits", "fr": "← Habitudes", "tn": "← Les habitudes", "ar": "← العادات"},
    "habitos.novo.label.icon":              {"pt-PT": "Ícone", "en": "Icon", "fr": "Icône", "tn": "Icône", "ar": "أيقونة"},
    "habitos.novo.label.color":             {"pt-PT": "Cor", "en": "Color", "fr": "Couleur", "tn": "Couleur", "ar": "لون"},
    "habitos.novo.legend.cadence":          {"pt-PT": "Cadência", "en": "Cadence", "fr": "Cadence", "tn": "Cadence", "ar": "الإيقاع"},
    "habitos.novo.cadence.daily":           {"pt-PT": "Diário", "en": "Daily", "fr": "Quotidien", "tn": "Quotidien", "ar": "يومي"},
    # === trabalhos ===
    "trabalhos.assignment.breadcrumb.home": {"pt-PT": "← Trabalhos", "en": "← Assignments", "fr": "← Devoirs", "tn": "← Les devoirs", "ar": "← الواجبات"},
}

stats = {}
for lang in ["pt-PT", "en", "fr", "tn", "ar"]:
    f = i18n_dir / f"{lang}.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    added = 0
    for k, translations in new_keys.items():
        if k not in d:
            d[k] = translations[lang]
            added += 1
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stats[lang] = (added, len(d))

print("=== gap-022 keys added ===")
for lang, (added, total) in stats.items():
    print(f"  {lang}: +{added}, total={total}")
print(f"Total new keys: {len(new_keys)}")
print(f"Total entries added across 5 locales: {sum(s[0] for s in stats.values())}")
