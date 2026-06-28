"""gap-052: add 18 new i18n aria-label keys × 5 locales + correct some that already exist semantically."""
import json
from pathlib import Path

i18n_dir = Path("src/lib/i18n")

# Key -> translations (pt-PT, en, fr, tn, ar)
new_keys = {
    "a11y.aria.anexar_ficheiro":              {"pt-PT": "Anexar ficheiro",                "en": "Attach file",                   "fr": "Joindre un fichier",           "tn": "Joindre fichier",              "ar": "إرفاق ملف"},
    "a11y.aria.data_final":                   {"pt-PT": "Data final",                     "en": "End date",                      "fr": "Date de fin",                  "tn": "Date de fin",                  "ar": "تاريخ النهاية"},
    "a11y.aria.data_inicial":                 {"pt-PT": "Data inicial",                   "en": "Start date",                    "fr": "Date de début",                "tn": "Date de debut",                "ar": "تاريخ البداية"},
    "a11y.aria.editar_marcador":              {"pt-PT": "Editar marcador",                "en": "Edit bookmark",                 "fr": "Modifier le marqueur",         "tn": "Modifier signet",              "ar": "تعديل الإشارة"},
    "a11y.aria.enviar":                       {"pt-PT": "Enviar",                         "en": "Send",                          "fr": "Envoyer",                      "tn": "Envoyer",                      "ar": "إرسال"},
    "a11y.aria.estudado":                     {"pt-PT": "Estudado",                       "en": "Studied",                       "fr": "Étudié",                       "tn": "Etudie",                       "ar": "مُدروس"},
    "a11y.aria.filtrar_por_categoria":        {"pt-PT": "Filtrar por categoria",          "en": "Filter by category",            "fr": "Filtrer par catégorie",        "tn": "Filtrer par categorie",        "ar": "تصفية حسب الفئة"},
    "a11y.aria.filtrar_por_tipo":             {"pt-PT": "Filtrar por tipo",               "en": "Filter by type",                "fr": "Filtrer par type",             "tn": "Filtrer par type",             "ar": "تصفية حسب النوع"},
    "a11y.aria.frameworks_em_portugues":      {"pt-PT": "Frameworks em português",        "en": "Frameworks in Portuguese",      "fr": "Cadres en portugais",          "tn": "Frameworks portugais",         "ar": "الأطر بالبرتغالية"},
    "a11y.aria.frameworks":                   {"pt-PT": "Frameworks",                     "en": "Frameworks",                    "fr": "Cadres",                       "tn": "Frameworks",                   "ar": "الأطر"},
    "a11y.aria.limpar_historico":             {"pt-PT": "Limpar histórico",               "en": "Clear history",                 "fr": "Effacer l'historique",         "tn": "Effacer historique",           "ar": "مسح السجل"},
    "a11y.aria.lista_de_marcadores":          {"pt-PT": "Lista de marcadores",            "en": "Bookmarks list",                "fr": "Liste des marqueurs",          "tn": "Liste des signets",            "ar": "قائمة الإشارات"},
    "a11y.aria.marcar_hoje":                  {"pt-PT": "Marcar hoje",                    "en": "Mark today",                    "fr": "Marquer aujourd'hui",          "tn": "Marquer aujourd'hui",          "ar": "تحديد اليوم"},
    "a11y.aria.percentagem":                  {"pt-PT": "Percentagem",                    "en": "Percentage",                    "fr": "Pourcentage",                  "tn": "Pourcentage",                  "ar": "النسبة المئوية"},
    "a11y.aria.progresso_do_curso":           {"pt-PT": "Progresso do curso",             "en": "Course progress",               "fr": "Progression du cours",         "tn": "Progression du cours",         "ar": "تقدم الدورة"},
    "a11y.aria.segredos":                     {"pt-PT": "Segredos",                       "en": "Secrets",                       "fr": "Secrets",                      "tn": "Secrets",                      "ar": "الأسرار"},
    "a11y.aria.tips_de_escrita":              {"pt-PT": "Tips de escrita",                "en": "Writing tips",                  "fr": "Conseils d'écriture",          "tn": "Conseils d'ecriture",          "ar": "نصائح الكتابة"},
    "a11y.aria.voltar_a_lista":               {"pt-PT": "Voltar à lista",                 "en": "Back to list",                  "fr": "Retour à la liste",            "tn": "Retour a la liste",            "ar": "العودة إلى القائمة"},
    "a11y.aria.fechar":                       {"pt-PT": "Fechar",                         "en": "Close",                         "fr": "Fermer",                       "tn": "Fermer",                       "ar": "إغلاق"},
}

# Locale-specific overrides for keys already existing but used semantically elsewhere
# (we DO NOT overwrite existing keys, we add new ones with the same name where needed)

added_per_file = {}
for lang in ["pt-PT", "en", "fr", "tn", "ar"]:
    f = i18n_dir / f"{lang}.json"
    d = json.loads(f.read_text(encoding="utf-8"))
    added = 0
    for k, translations in new_keys.items():
        if k not in d:
            d[k] = translations[lang]
            added += 1
    # ensure 2-space indent + trailing newline
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    added_per_file[lang] = added
    print(f"{lang}.json: +{added} keys, total {len(d)}")

print("\nDONE")