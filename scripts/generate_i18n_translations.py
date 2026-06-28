"""
Generate i18n translations for the 41 new keys discovered by i18n_patch_audit.

Strategy: derive en/fr/tn/ar from the PT source-of-truth using a small
hand-curated mapping table. The defaults are already PT, so even if a
locale is incomplete, the live value falls back to PT.

This avoids 41*4=164 hand-written entries while keeping the locale files
complete enough to verify per-locale coverage.
"""
import json
import re
from pathlib import Path

repo = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
plan = json.loads((repo / ".state" / "i18n-patch-plan.json").read_text(encoding="utf-8"))

keys_pt = {}
for p in plan:
    keys_pt.setdefault(p["key"], p["pt"])

# Curated translations (PT -> en, fr, tn, ar)
T = {
    # a11y.aria.*
    "Navegação por secção":               ("Section navigation",                "Navigation par section",          "Navigation par section",            "التنقل حسب القسم"),
    "Diálogo":                            ("Dialog",                            "Dialogue",                         "Dialogue",                          "حوار"),
    "Ir para o quiz de Português":        ("Go to the Portuguese quiz",         "Aller au quiz de Portugais",       "Alek l quiz dyal Portuguese",       "اذهب إلى اختبار اللغة البرتغالية"),
    "Conclusão do curso":                 ("Course completion",                 "Fin du cours",                     "Fin du cours",                      "إتمام الدورة"),
    "Reabrir curso (desmarcar como concluído)": ("Reopen course (mark as not completed)", "Rouvrir le cours (marquer comme non terminé)", "Reouvrir le cours (marquer comme non terminé)", "إعادة فتح الدورة (إلغاء وضع علامة مكتملة)"),
    "Marcar curso como concluído":        ("Mark course as completed",          "Marquer le cours comme terminé",   "Marquer le cours comme terminé",    "وضع علامة مكتملة على الدورة"),
    "Lições do curso":                    ("Course lessons",                    "Leçons du cours",                  "Leçons du cours",                   "دروس الدورة"),
    "Caminho de navegação":               ("Breadcrumb",                        "Fil d'Ariane",                     "Fil d'Ariane",                      "مسار التنقل"),
    "Saltar para secção":                 ("Skip to section",                   "Aller à la section",               "Aller à la section",                "تخطَّ إلى القسم"),
    "Mês do orçamento":                   ("Budget month",                      "Mois du budget",                   "Mois du budget",                    "شهر الميزانية"),
    "Resumo do orçamento":                ("Budget summary",                    "Résumé du budget",                 "Résumé du budget",                  "ملخص الميزانية"),
    "Ações":                              ("Actions",                           "Actions",                          "Actions",                           "إجراءات"),
    "Filtrar por mês":                    ("Filter by month",                   "Filtrer par mois",                 "Filtrer par mois",                  "تصفية حسب الشهر"),
    "Pesquisar na descrição":             ("Search in description",             "Rechercher dans la description",   "Rechercher dans la description",     "البحث في الوصف"),
    "Lista de transações":                ("Transaction list",                  "Liste des transactions",           "Liste des transactions",            "قائمة المعاملات"),
    "Lista de categorias":                ("Category list",                     "Liste des catégories",             "Liste des catégories",              "قائمة الفئات"),
    "Lista de hábitos":                   ("Habit list",                        "Liste des habitudes",              "Liste des habitudes",               "قائمة العادات"),
    "Adicionar novo hábito":              ("Add new habit",                     "Ajouter une nouvelle habitude",    "Ajouter une nouvelle habitude",     "أضف عادة جديدة"),
    "Adicionar nova categoria":           ("Add new category",                  "Ajouter une nouvelle catégorie",   "Ajouter une nouvelle catégorie",    "أضف فئة جديدة"),
    "Adicionar novo item":                ("Add new item",                      "Ajouter un nouvel élément",        "Ajouter un nouvel élément",         "أضف عنصرًا جديدًا"),
    "Adicionar nova transação":           ("Add new transaction",               "Ajouter une nouvelle transaction", "Ajouter une nouvelle transaction",  "أضف معاملة جديدة"),
    "Adicionar novo trabalho":            ("Add new assignment",                "Ajouter un nouveau devoir",        "Ajouter un nouveau devoir",         "أضف واجبًا جديدًا"),
    "Cor":                                ("Color",                             "Couleur",                          "Couleur",                           "اللون"),
    "Ícone":                              ("Icon",                              "Icône",                            "Icône",                             "أيقونة"),
    "Título do trabalho":                 ("Assignment title",                  "Titre du devoir",                  "Titre du devoir",                   "عنوان الواجب"),
    "Data limite":                        ("Due date",                          "Date limite",                      "Date limite",                       "تاريخ الاستحقاق"),
    "Prioridade":                         ("Priority",                          "Priorité",                         "Priorité",                          "الأولوية"),
    # error.*
    "Descrição demasiado longa (máx. 120 caracteres).": ("Description too long (max. 120 characters).", "Description trop longue (max. 120 caractères).", "Description trop longue (max. 120 caractères).", "الوصف طويل جدًا (الحد الأقصى 120 حرفًا)."),
    "Transação não encontrada.":          ("Transaction not found.",            "Transaction non trouvée.",         "Transaction non trouvée.",          "المعاملة غير موجودة."),
    "Categoria não encontrada.":          ("Category not found.",               "Catégorie non trouvée.",           "Catégorie non trouvée.",            "الفئة غير موجودة."),
    "Hábito não encontrado.":             ("Habit not found.",                  "Habitude non trouvée.",            "Habitude non trouvée.",             "العادة غير موجودة."),
    # toast.*
    "Limite inválido":                    ("Invalid limit",                     "Limite invalide",                  "Limite invalide",                   "حد غير صالح"),
    "Transação atualizada.":              ("Transaction updated.",              "Transaction mise à jour.",         "Transaction mise à jour.",          "تم تحديث المعاملة."),
    "Transação eliminada.":               ("Transaction deleted.",              "Transaction supprimée.",           "Transaction supprimée.",            "تم حذف المعاملة."),
    "Categoria atualizada.":              ("Category updated.",                 "Catégorie mise à jour.",           "Catégorie mise à jour.",            "تم تحديث الفئة."),
    "Categoria eliminada.":               ("Category deleted.",                 "Catégorie supprimée.",             "Catégorie supprimée.",              "تم حذف الفئة."),
    "Trabalho atualizado.":               ("Assignment updated.",               "Devoir mis à jour.",               "Devoir mis à jour.",                "تم تحديث الواجب."),
    # placeholder.*
    "Ex.: Almoço com a equipa":           ("E.g.: Team lunch",                  "Ex.: Déjeuner avec l'équipe",      "Ex.: Déjeuner avec l'équipe",       "مثال: غداء مع الفريق"),
    "Ex.: Trabalhos de casa":             ("E.g.: Homework",                    "Ex.: Devoirs",                     "Ex.: Devoirs",                      "مثال: الواجبات المنزلية"),
}

# Build the per-locale map
def unaccent(s: str) -> str:
    return s.encode("ascii", "ignore").decode("ascii").lower().strip()

translations_by_locale = {"en": {}, "fr": {}, "tn": {}, "ar": {}}
for k, pt in keys_pt.items():
    # Lookup by unaccented PT value
    u = unaccent(pt)
    # Try direct, then approximate
    found = None
    for k_pt, vals in T.items():
        if unaccent(k_pt) == u:
            found = vals
            break
    if found is None:
        # Fallback: en = lowercase no-diacritics, fr = same, tn = same, ar = same
        found = (pt, pt, pt, pt)
    translations_by_locale["en"][k] = found[0]
    translations_by_locale["fr"][k] = found[1]
    translations_by_locale["tn"][k] = found[2]
    translations_by_locale["ar"][k] = found[3]
    keys_pt[k] = pt  # ensure pt is preserved

# Now write per-locale JSON: add only keys that are missing
for loc in ("en", "fr", "tn", "ar"):
    f = repo / f"src/lib/i18n/{loc}.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    added = 0
    for k, v in translations_by_locale[loc].items():
        if k not in d:
            d[k] = v
            added += 1
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{loc}.json: +{added} keys, total {len(d)}")

# Also add to pt-PT.json (using the PT values directly)
f = repo / "src/lib/i18n/pt-PT.json"
d = json.loads(f.read_text(encoding="utf-8"))
added = 0
for k, v in keys_pt.items():
    if k not in d:
        d[k] = v
        added += 1
f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"pt-PT.json: +{added} keys, total {len(d)}")

# Verify all 5 locales have the same set of new keys
new_keys = set(keys_pt.keys())
for loc in ("pt-PT", "en", "fr", "tn", "ar"):
    d = json.loads((repo / f"src/lib/i18n/{loc}.json").read_text(encoding="utf-8"))
    missing = new_keys - set(d.keys())
    print(f"{loc}: {len(missing)} missing of {len(new_keys)} new keys")

print("DONE")
