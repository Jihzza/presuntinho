"""
GAP-016: Patch <title> elements in routes to use $t() with fallbacks.
GAP-017: Patch PT strings hardcoded in body (h3, p, span.hint, label).

Strategy:
  1. Add new i18n keys for the 16 titles + 10 body strings (5 locales × 26 = 130 keys)
  2. Replace the hardcoded text with $t() calls using locale-aware fallbacks
"""
import json
import re
from pathlib import Path

REPO = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
I18N = REPO / "src" / "lib" / "i18n"

# ---- Define new keys (route titles + body strings) ----
# Each: (key, pt, en, fr, tn, ar)
NEW_KEYS = [
    # ROUTE TITLES (gap-016)
    ("routes.biblioteca.title",       "Biblioteca · Bookmarks",                "Library · Bookmarks",                "Bibliothèque · Signets",                "La bibliothèque · Signets",                 "المكتبة · الإشارات المرجعية"),
    ("routes.biblioteca.new.title",   "Novo Marcador",                         "New Bookmark",                        "Nouveau signet",                        "Signet jdid",                                "إشارة جديدة"),
    ("routes.case.title",             "Case · Equivalenza Deep Dive",          "Case · Equivalenza Deep Dive",        "Cas · Equivalenza Plongée",             "Case · Equivalenza",                         "دراسة حالة · Equivalenza"),
    ("routes.course.title",           "Course · Teoria",                       "Course · Theory",                    "Cours · Théorie",                       "Cours · Theorie",                            "دورة · نظرية"),
    ("routes.dl.title",               "Downloads · Assignment Center",         "Downloads · Assignment Center",       "Téléchargements · Centre Devoirs",       "Downloads · Centre Devoirs",                 "التنزيلات · مركز الواجبات"),
    ("routes.escola.title",           "Escola · Cursos e Quizzes",             "School · Courses and Quizzes",        "École · Cours et Quiz",                "L'ecole · Cours w Quiz",                     "المدرسة · الدورات والاختبارات"),
    ("routes.escola.caderno.title",   "Meu Caderno",                           "My Notebook",                         "Mon Cahier",                            "Mon cahier",                                 "دفتر ملاحظاتي"),
    ("routes.escola.quizpt.title",    "Quiz PT",                               "PT Quiz",                             "Quiz PT",                               "Quiz PT",                                    "اختبار PT"),
    ("routes.financas.title",         "Finanças · Dashboard",                  "Finance · Dashboard",                 "Finances · Tableau de bord",            "Flous · Dashboard",                          "المالية · لوحة التحكم"),
    ("routes.habitos.title",          "Hábitos · Daily Check-in",              "Habits · Daily Check-in",             "Habitudes · Bilan quotidien",           "Les habitudes · Bilan",                      "العادات · تسجيل يومي"),
    ("routes.pt.title",               "Aulas em Português",                    "Lessons in Portuguese",               "Leçons en portugais",                   "Leçons en portugais",                        "دروس بالبرتغالية"),
    ("routes.secrets.title",          "Secrets",                               "Secrets",                             "Secrets",                               "Les secrets",                                "الأسرار"),
    ("routes.trabalhos.title",        "Trabalhos · Entregas e Prazos",         "Assignments · Deadlines",             "Devoirs · Rendus et Échéances",         "Les devoirs · Delais",                       "الواجبات · المواعيد النهائية"),
    ("routes.walk.title",             "Walkthrough · Assignment",              "Walkthrough · Assignment",            "Walkthrough · Devoir",                  "Walkthrough · Devoir",                       "شرح · واجب"),
    # ERROR page (gap-016/017)
    ("error.title",                   "Página não encontrada",                 "Page not found",                       "Page introuvable",                      "Page introuvable",                           "الصفحة غير موجودة"),
    # BODY STRINGS (gap-017)
    ("biblioteca.new.name.hint",      "Como queres identificar este link?",    "How do you want to identify this link?", "Comment veux-tu identifier ce lien ?", "Kifach t'identifier ce lien ?",              "كيف تريد تحديد هذا الرابط؟"),
    ("biblioteca.new.tags.hint",      "Separa com vírgulas. Até 10 tags por marcador.", "Separate with commas. Up to 10 tags per bookmark.", "Sépare par des virgules. Jusqu'à 10 tags par signet.", "Separation b virgules. 10 tags max par signet.", "افصل بفواصل. حتى 10 وسوم لكل إشارة."),
    ("case.kpi.sales2015",            "Pico de vendas em 2015",                "Sales peak in 2015",                  "Pic des ventes en 2015",                "Pic des ventes en 2015",                     "ذروة المبيعات في 2015"),
    ("case.kpi.storesPeak",           "Lojas no pico",                         "Stores at peak",                      "Magasins au pic",                       "Magasins au pic",                            "المتاجر في الذروة"),
    ("case.tagline",                  "O que ela valoriza",                    "What she values",                      "Ce qu'elle valorise",                   "Ce qu'elle valorise",                        "ما تقدّره"),
    ("case.value",                    "Isto garante:",                         "This guarantees:",                    "Ceci garantit :",                       "Haka y garanti:",                            "هذا يضمن:"),
    ("dl.sub",                        "Ficheiros do assignment e materiais de estudo.", "Assignment files and study materials.", "Fichiers du devoir et matériel d'étude.", "Fichiers du devoir w materiel.",              "ملفات الواجب ومواد الدراسة."),
    ("transacoes.sub",                "Histórico de receitas e despesas.",     "Income and expenses history.",         "Historique des revenus et dépenses.",    "Historique des revenus w depenses.",          "سجل الدخل والمصروفات."),
    ("habitos.new.name.hint",         "Como queres chamar este hábito?",        "What do you want to call this habit?", "Comment veux-tu nommer cette habitude ?", "Kifach t'appeli cette habitude ?",            "كيف تريد تسمية هذه العادة؟"),
    ("escola.curso.plan.title",       "Plano de aulas",                        "Lesson plan",                         "Plan de cours",                         "Plan de cours",                              "خطة الدروس"),
]

# Write to each locale
locales = ["pt-PT", "en", "fr", "tn", "ar"]
loc_map = {"pt-PT": 1, "en": 2, "fr": 3, "tn": 4, "ar": 5}

for loc in locales:
    f = I18N / f"{loc}.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    added = 0
    for key in NEW_KEYS:
        if key[0] not in d:
            d[key[0]] = key[loc_map[loc]]
            added += 1
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{loc}.json: +{added} keys, total {len(d)}")

print("DONE — i18n keys added")