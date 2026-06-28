"""Rename stripped-as-accent i18n keys to clean form across:
  - src/lib/i18n/{pt-PT,en,fr,tn,ar}.json
  - src/routes/**/*.svelte (any $t('old_key') call + JS string references)

Also fixes EN translations that accidentally stayed in PT, and fixes the
wrong "(máx. 120 caracteres)" default that should be 500 for biblioteca description.
"""
import json, re, os, sys
from pathlib import Path

repo = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")

# (stripped_key, clean_key, value_pt, value_en, value_fr, value_tn, value_ar)
# value_fr/tn/ar reused from the original staged JSON content
RENAMES = [
    # a11y.aria.*
    ("a11y.aria.navega_o_por_sec_o", "a11y.aria.navegacao_por_seccao", "Navegação por secção", "Section navigation", "Navigation par section", "Navigation par section", "التنقل حسب القسم"),
    ("a11y.aria.di_logo", "a11y.aria.dialogo", "Diálogo", "Dialog", "Dialogue", "Dialogue", "حوار"),
    ("a11y.aria.ir_para_o_quiz_de_portugu_s", "a11y.aria.ir_para_o_quiz_de_portugues", "Ir para o quiz de Português", "Go to the Portuguese quiz", "Aller au quiz de Portugais", "Alek l quiz dyal Portuguese", "اذهب إلى اختبار اللغة البرتغالية"),
    ("a11y.aria.conclus_o_do_curso", "a11y.aria.conclusao_do_curso", "Conclusão do curso", "Course completion", "Fin du cours", "Fin du cours", "إتمام الدورة"),
    ("a11y.aria.reabrir_curso_desmarcar_como", "a11y.aria.reabrir_curso_desmarcar_como", "Reabrir curso (desmarcar como concluído)", "Reopen course (mark as not completed)", "Rouvrir le cours (marquer comme non terminé)", "Rouvrir le cours (marquer comme non terminé)", "إعادة فتح الدورة (إلغاء وضع علامة مكتملة)"),
    ("a11y.aria.marcar_curso_como_conclu_do", "a11y.aria.marcar_curso_como_concluido", "Marcar curso como concluído", "Mark course as completed", "Marquer le cours comme terminé", "Marquer le cours comme terminé", "وضع علامة مكتملة على الدورة"),
    ("a11y.aria.li_es_do_curso", "a11y.aria.licoes_do_curso", "Lições do curso", "Course lessons", "Leçons du cours", "Leçons du cours", "دروس الدورة"),
    ("a11y.aria.caminho_de_navega_o", "a11y.aria.caminho_de_navegacao", "Caminho de navegação", "Breadcrumb", "Fil d'Ariane", "Fil d'Ariane", "مسار التنقل"),
    ("a11y.aria.saltar_para_sec_o", "a11y.aria.saltar_para_seccao", "Saltar para secção", "Skip to section", "Aller à la section", "Aller à la section", "تخطَّ إلى القسم"),
    ("a11y.aria.m_s_do_or_amento", "a11y.aria.mes_do_orcamento", "Mês do orçamento", "Budget month", "Mois du budget", "Mois du budget", "شهر الميزانية"),
    ("a11y.aria.resumo_do_or_amento", "a11y.aria.resumo_do_orcamento", "Resumo do orçamento", "Budget summary", "Résumé du budget", "Résumé du budget", "ملخص الميزانية"),
    ("a11y.aria.a_es", "a11y.aria.acoes", "Ações", "Actions", "Actions", "Actions", "إجراءات"),
    ("a11y.aria.filtrar_por_m_s", "a11y.aria.filtrar_por_mes", "Filtrar por mês", "Filter by month", "Filtrer par mois", "Filtrer par mois", "تصفية حسب الشهر"),
    ("a11y.aria.pesquisar_na_descri_o", "a11y.aria.pesquisar_na_descricao", "Pesquisar na descrição", "Search in description", "Rechercher dans la description", "Rechercher dans la description", "البحث في الوصف"),
    ("a11y.aria.lista_de_transa_es", "a11y.aria.lista_de_transacoes", "Lista de transações", "Transaction list", "Liste des transactions", "Liste des transactions", "قائمة المعاملات"),
    ("a11y.aria.tipo_de_transa_o", "a11y.aria.tipo_de_transacao", "Tipo de transação", "Transaction type", "Type de transaction", "Type de transaction", "نوع المعاملة"),
    ("a11y.aria.eliminar_transa_o", "a11y.aria.eliminar_transacao", "Eliminar transação", "Delete transaction", "Supprimer la transaction", "Supprimer la transaction", "حذف المعاملة"),
    ("a11y.aria.lista_de_h_bitos", "a11y.aria.lista_de_habitos", "Lista de hábitos", "Habit list", "Liste des habitudes", "Liste des habitudes", "قائمة العادات"),
    ("a11y.aria.estat_sticas", "a11y.aria.estatisticas", "Estatísticas", "Statistics", "Statistiques", "Statistiques", "إحصائيات"),
    ("a11y.aria.sugest_es_de_cones", "a11y.aria.sugestoes_de_icones", "Sugestões de ícones", "Icon suggestions", "Suggestions d'icônes", "Suggestions d'icônes", "اقتراحات الأيقونات"),
    ("a11y.aria.cor_do_h_bito", "a11y.aria.cor_do_habito", "Cor do hábito", "Habit color", "Couleur de l'habitude", "Couleur de l'habitude", "لون العادة"),
    ("a11y.aria.dura_o_estimada", "a11y.aria.duracao_estimada", "Duração estimada", "Estimated duration", "Durée estimée", "Durée estimée", "المدة المقدرة"),
    ("a11y.aria.descri_o_do_trabalho", "a11y.aria.descricao_do_trabalho", "Descrição do trabalho", "Assignment description", "Description du devoir", "Description du devoir", "وصف الواجب"),
    ("a11y.aria.mapa_de_calor_dos_ltimos_day", "a11y.aria.mapa_de_calor_dos_ultimos_dias", "Mapa de calor dos últimos {days} dias", "Heatmap of the last {days} days", "Carte de chaleur des {days} derniers jours", "Carte de chaleur des {days} derniers jours", "خريطة الحرارة لآخر {days} يومًا"),
    # error.*
    ("error.descri_o_demasiado_longa_m_x", "error.descricao_demasiado_longa_max", "Descrição demasiado longa (máx. {max} caracteres).", "Description too long (max. {max} characters).", "Description trop longue (max. {max} caractères).", "Description trop longue (max. {max} caractères).", "الوصف طويل جدًا (الحد الأقصى {max} حرفًا)."),
    ("error.transa_o_n_o_encontrada", "error.transacao_nao_encontrada", "Transação não encontrada.", "Transaction not found.", "Transaction non trouvée.", "Transaction non trouvée.", "المعاملة غير موجودة."),
    ("error.erro_a_remover_a_transa_o", "error.erro_a_remover_a_transacao", "Erro a remover a transação.", "Error removing transaction.", "Erreur lors de la suppression de la transaction.", "Erreur lors de la suppression de la transaction.", "خطأ في إزالة المعاملة."),
    ("error.h_bito_n_o_encontrado", "error.habito_nao_encontrado", "Hábito não encontrado.", "Habit not found.", "Habitude non trouvée.", "Habitude non trouvée.", "العادة غير موجودة."),
    ("error.o_nome_obrigat_rio", "error.o_nome_obrigatorio", "O nome é obrigatório.", "The name is required.", "Le nom est obligatoire.", "Le nom est obligatoire.", "الاسم مطلوب."),
    ("error.nome_demasiado_longo_m_x_60_", "error.nome_demasiado_longo_max_60", "Nome demasiado longo (máx. 60 caracteres).", "Name too long (max. 60 characters).", "Nom trop long (max. 60 caractères).", "Nom trop long (max. 60 caractères).", "الاسم طويل جدًا (الحد الأقصى 60 حرفًا)."),
    ("error.o_t_tulo_obrigat_rio", "error.o_titulo_obrigatorio", "O título é obrigatório.", "The title is required.", "Le titre est obligatoire.", "Le titre est obligatoire.", "العنوان مطلوب."),
    ("error.t_tulo_demasiado_longo_m_x_1", "error.titulo_demasiado_longo_max_120", "Título demasiado longo (máx. 120 caracteres).", "Title too long (max. 120 characters).", "Titre trop long (max. 120 caractères).", "Titre trop long (max. 120 caractères).", "العنوان طويل جدًا (الحد الأقصى 120 حرفًا)."),
    ("error.o_url_tem_de_come_ar_por_htt", "error.o_url_tem_de_comecar_por_http", "O URL tem de começar por http:// ou https://.", "The URL must start with http:// or https://.", "L'URL doit commencer par http:// ou https://.", "L'URL doit commencer par http:// ou https://.", "يجب أن يبدأ عنوان URL بـ http:// أو https://."),
    ("error.m_ximo_de_10_tags_por_marcad", "error.maximo_de_10_tags_por_marcador", "Máximo de 10 tags por marcador.", "Maximum of 10 tags per bookmark.", "Maximum de 10 tags par marqueur.", "Maximum de 10 tags par marqueur.", "الحد الأقصى 10 علامات لكل إشارة."),
    ("error.trabalho_n_o_especificado", "error.trabalho_nao_especificado", "Trabalho não especificado.", "Assignment not specified.", "Devoir non spécifié.", "Devoir non spécifié.", "لم يتم تحديد الواجب."),
    # toast.*
    ("toast.limite_inv_lido", "toast.limite_invalido", "Limite inválido", "Invalid limit", "Limite invalide", "Limite invalide", "حد غير صالح"),
    ("toast.transa_o_atualizada", "toast.transacao_atualizada", "Transação atualizada.", "Transaction updated.", "Transaction mise à jour.", "Transaction mise à jour.", "تم تحديث المعاملة."),
    ("toast.transa_o_removida", "toast.transacao_removida", "Transação removida.", "Transaction removed.", "Transaction supprimée.", "Transaction supprimée.", "تم حذف المعاملة."),
    ("toast.marca_o_removida", "toast.marcacao_removida", "Marcação removida", "Check-in removed", "Marquage supprimé", "Marquage supprimé", "تم إزالة التحديد"),
    ("toast.h_bito_criado", "toast.habito_criado", "Hábito criado", "Habit created", "Habitude créée", "Habitude créée", "تم إنشاء العادة"),
    # placeholder.*
    ("placeholder.ex_almo_o_com_a_equipa", "placeholder.ex_almoco_com_a_equipa", "Ex.: Almoço com a equipa", "E.g.: Team lunch", "Ex. : Déjeuner avec l'équipe", "Ex. : Déjeuner avec l'équipe", "مثال: غداء مع الفريق"),
]

RENAMES_DICT = {old: new for old, new, *_ in RENAMES}
# Build complete per-locale value map: clean_key -> {pt,en,fr,tn,ar}
LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]
VALUE_BY_KEY = {}
for old, new, pt, en, fr, tn, ar in RENAMES:
    VALUE_BY_KEY[new] = {"pt-PT": pt, "en": en, "fr": fr, "tn": tn, "ar": ar}

# Step 1: rewrite all 5 locale JSONs
for locale in LOCALES:
    p = repo / f"src/lib/i18n/{locale}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    changed = False
    for old, new in RENAMES_DICT.items():
        if old in data:
            val = data.pop(old)
            # Don't blindly keep val — use proper per-locale translations
            data[new] = VALUE_BY_KEY[new][locale]
            changed = True
        elif new not in data:
            data[new] = VALUE_BY_KEY[new][locale]
            changed = True
    if changed:
        # Re-sort keys for stable diff
        sorted_data = dict(sorted(data.items()))
        p.write_text(json.dumps(sorted_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[OK] {locale}.json — renamed keys")

# Step 2: rewrite all .svelte files that reference stripped keys
svelte_files = list((repo / "src").rglob("*.svelte"))
svelte_count = 0
for sf in svelte_files:
    text = sf.read_text(encoding="utf-8")
    orig = text
    for old, new in RENAMES_DICT.items():
        # Replace $t('old', ...) and $t("old", ...) and "old" inside JS string contexts
        text = re.sub(r"\$t\(['\"]" + re.escape(old) + r"['\"]", "$t('" + new + "'", text)
        # Also replace inside string literals (e.g. showToast($t('toast.old')))
        # (already covered above) — also raw JS strings (very rare)
    if text != orig:
        sf.write_text(text, encoding="utf-8")
        svelte_count += 1
        print(f"[OK] {sf.relative_to(repo)} — patched")

# Step 3: fix biblioteca/novo description max: was 500 chars, default change broke it to 120.
biblio = repo / "src/routes/biblioteca/novo/+page.svelte"
t = biblio.read_text(encoding="utf-8")
if "error.descricao_demasiado_longa_max" in t and "trimmedDesc.length > 500" in t:
    # The key is generic "max" — the call must pass max=500 as a parameter to get "máx. 500"
    # Replace the $t(...) call to pass { max: 500 }
    t = t.replace(
        "error = $t('error.descricao_demasiado_longa_max', { default: 'Descrição demasiado longa (máx. 500 caracteres).' });",
        "error = $t('error.descricao_demasiado_longa_max', { default: 'Descrição demasiado longa (máx. 500 caracteres).', max: 500 });"
    )
    biblio.write_text(t, encoding="utf-8")
    print(f"[OK] biblioteca/novo — fixed max=500 param")

print(f"\nDone. Renamed {len(RENAMES)} keys in 5 JSON files. Patched {svelte_count} Svelte files.")
