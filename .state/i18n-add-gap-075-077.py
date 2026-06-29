import json, os
ROOT = 'C:/Users/rafaa/Documents/GitHub/presuntinho'
os.chdir(ROOT)

# Keys to add (PT defaults)
NEW_KEYS = {
    'habitos.habit.carregando': 'A carregar…',
    'habitos.habit.nao_encontrado': 'Hábito não encontrado.',
    'habitos.habit.erro_carregar': 'Erro a carregar hábito.',
    'habitos.habit.toast.marcado': 'Marcado como feito ✅',
    'habitos.habit.toast.erro': 'Erro a atualizar',
    'habitos.habit.streak.zero': 'Começa hoje — carrega em "Marcar como feito"',
    'habitos.habit.streak.um_dia': '1 dia seguido. Continua!',
    'habitos.habit.streak.n_dias': '{n} dias seguidos.',
    'habitos.habit.seo.title_fallback': 'Hábito · Hábitos',
    'habitos.habit.seo.title_template': '{name} · Hábitos',
    'habitos.habit.seo.description': 'Detalhe do hábito',
    'habitos.habit.btn.feito_hoje': 'Marcar como feito hoje',
    'habitos.habit.btn.desfazer': '✓ Feito hoje — desfazer',
    'habitos.habit.cadencia.diaria': 'Hábito diário',
    'habitos.habit.back.voltar': '← Voltar aos hábitos',

    # financas/transacoes/[id] — already some keys exist, need new
    'financas.transacoes.editar.erro.carregar': 'Erro a carregar transação.',
    'financas.transacoes.editar.erro.valor_zero': 'O valor tem de ser maior que zero.',
    'financas.transacoes.editar.erro.sem_categoria': 'Escolhe uma categoria.',
    'financas.transacoes.editar.erro.sem_data': 'Indica uma data.',
    'financas.transacoes.editar.erro.guardar': 'Erro a guardar a transação.',

    # biblioteca/item/[id]
    'biblioteca.item.toast.removido': 'Marcador removido',
    'biblioteca.item.toast.erro_remover': 'Erro a remover marcador',
    'biblioteca.item.seo.title_com_nome': '{title} · Marcador · Biblioteca',
    'biblioteca.item.seo.title_fallback': 'Marcador · Biblioteca',
    'biblioteca.item.seo.description': 'Detalhe do marcador',
    'biblioteca.item.btn.confirmar': 'Confirmar remoção',
    'biblioteca.item.btn.confirmar_apagar': 'Confirmar apagar?',
    'biblioteca.item.btn.apagando': 'A apagar…',
}

# Translation map for other locales
TRANSLATIONS = {
    'en': {
        'habitos.habit.carregando': 'Loading…',
        'habitos.habit.nao_encontrado': 'Habit not found.',
        'habitos.habit.erro_carregar': 'Error loading habit.',
        'habitos.habit.toast.marcado': 'Marked as done ✅',
        'habitos.habit.toast.erro': 'Error updating',
        'habitos.habit.streak.zero': 'Start today — tap "Mark as done"',
        'habitos.habit.streak.um_dia': '1 day streak. Keep going!',
        'habitos.habit.streak.n_dias': '{n} day streak.',
        'habitos.habit.seo.title_fallback': 'Habit · Habits',
        'habitos.habit.seo.title_template': '{name} · Habits',
        'habitos.habit.seo.description': 'Habit detail',
        'habitos.habit.btn.feito_hoje': 'Mark as done today',
        'habitos.habit.btn.desfazer': '✓ Done today — undo',
        'habitos.habit.cadencia.diaria': 'Daily habit',
        'habitos.habit.back.voltar': '← Back to habits',

        'financas.transacoes.editar.erro.carregar': 'Error loading transaction.',
        'financas.transacoes.editar.erro.valor_zero': 'Amount must be greater than zero.',
        'financas.transacoes.editar.erro.sem_categoria': 'Choose a category.',
        'financas.transacoes.editar.erro.sem_data': 'Pick a date.',
        'financas.transacoes.editar.erro.guardar': 'Error saving transaction.',

        'biblioteca.item.toast.removido': 'Bookmark removed',
        'biblioteca.item.toast.erro_remover': 'Error removing bookmark',
        'biblioteca.item.seo.title_com_nome': '{title} · Bookmark · Library',
        'biblioteca.item.seo.title_fallback': 'Bookmark · Library',
        'biblioteca.item.seo.description': 'Bookmark detail',
        'biblioteca.item.btn.confirmar': 'Confirm removal',
        'biblioteca.item.btn.confirmar_apagar': 'Confirm delete?',
        'biblioteca.item.btn.apagando': 'Deleting…',
    },
    'fr': {
        'habitos.habit.carregando': 'Chargement…',
        'habitos.habit.nao_encontrado': 'Habitude non trouvée.',
        'habitos.habit.erro_carregar': 'Erreur de chargement.',
        'habitos.habit.toast.marcado': 'Marqué comme fait ✅',
        'habitos.habit.toast.erro': 'Erreur de mise à jour',
        'habitos.habit.streak.zero': 'Commence aujourd\'hui — clique sur "Marquer comme fait"',
        'habitos.habit.streak.um_dia': '1 jour d\'affilée. Continue!',
        'habitos.habit.streak.n_dias': '{n} jours d\'affilée.',
        'habitos.habit.seo.title_fallback': 'Habitude · Habitudes',
        'habitos.habit.seo.title_template': '{name} · Habitudes',
        'habitos.habit.seo.description': 'Détail de l\'habitude',
        'habitos.habit.btn.feito_hoje': 'Marquer comme fait',
        'habitos.habit.btn.desfazer': '✓ Fait aujourd\'hui — annuler',
        'habitos.habit.cadencia.diaria': 'Habitude quotidienne',
        'habitos.habit.back.voltar': '← Retour aux habitudes',

        'financas.transacoes.editar.erro.carregar': 'Erreur de chargement.',
        'financas.transacoes.editar.erro.valor_zero': 'Le montant doit être supérieur à zéro.',
        'financas.transacoes.editar.erro.sem_categoria': 'Choisis une catégorie.',
        'financas.transacoes.editar.erro.sem_data': 'Indique une date.',
        'financas.transacoes.editar.erro.guardar': 'Erreur d\'enregistrement.',

        'biblioteca.item.toast.removido': 'Marque-page supprimé',
        'biblioteca.item.toast.erro_remover': 'Erreur de suppression',
        'biblioteca.item.seo.title_com_nome': '{title} · Marque-page · Bibliothèque',
        'biblioteca.item.seo.title_fallback': 'Marque-page · Bibliothèque',
        'biblioteca.item.seo.description': 'Détail du marque-page',
        'biblioteca.item.btn.confirmar': 'Confirmer la suppression',
        'biblioteca.item.btn.confirmar_apagar': 'Confirmer la suppression?',
        'biblioteca.item.btn.apagando': 'Suppression…',
    },
    'ar': {
        'habitos.habit.carregando': 'جار التحميل…',
        'habitos.habit.nao_encontrado': 'العادة غير موجودة.',
        'habitos.habit.erro_carregar': 'خطأ في تحميل العادة.',
        'habitos.habit.toast.marcado': 'تم وضع علامة منجز ✅',
        'habitos.habit.toast.erro': 'خطأ في التحديث',
        'habitos.habit.streak.zero': 'ابدأ اليوم — اضغط "وضع علامة منجز"',
        'habitos.habit.streak.um_dia': 'يوم واحد متتالي. واصل!',
        'habitos.habit.streak.n_dias': '{n} أيام متتالية.',
        'habitos.habit.seo.title_fallback': 'العادة · العادات',
        'habitos.habit.seo.title_template': '{name} · العادات',
        'habitos.habit.seo.description': 'تفاصيل العادة',
        'habitos.habit.btn.feito_hoje': 'وضع علامة منجز اليوم',
        'habitos.habit.btn.desfazer': '✓ تم اليوم — تراجع',
        'habitos.habit.cadencia.diaria': 'عادة يومية',
        'habitos.habit.back.voltar': '← العودة إلى العادات',

        'financas.transacoes.editar.erro.carregar': 'خطأ في تحميل المعاملة.',
        'financas.transacoes.editar.erro.valor_zero': 'يجب أن يكون المبلغ أكبر من صفر.',
        'financas.transacoes.editar.erro.sem_categoria': 'اختر فئة.',
        'financas.transacoes.editar.erro.sem_data': 'حدد تاريخًا.',
        'financas.transacoes.editar.erro.guardar': 'خطأ في الحفظ.',

        'biblioteca.item.toast.removido': 'تمت إزالة الإشارة',
        'biblioteca.item.toast.erro_remover': 'خطأ في الإزالة',
        'biblioteca.item.seo.title_com_nome': '{title} · إشارة · مكتبة',
        'biblioteca.item.seo.title_fallback': 'إشارة · مكتبة',
        'biblioteca.item.seo.description': 'تفاصيل الإشارة',
        'biblioteca.item.btn.confirmar': 'تأكيد الإزالة',
        'biblioteca.item.btn.confirmar_apagar': 'تأكيد الحذف؟',
        'biblioteca.item.btn.apagando': 'جارٍ الحذف…',
    },
    'tn': {
        'habitos.habit.carregando': 'Qua ta carrega…',
        'habitos.habit.nao_encontrado': 'Hábito não encontrado.',
        'habitos.habit.erro_carregar': 'Erro a carregar hábito.',
        'habitos.habit.toast.marcado': 'Marcado como feito ✅',
        'habitos.habit.toast.erro': 'Erro a atualizar',
        'habitos.habit.streak.zero': 'Começa hoje — carrega em "Marcar como feito"',
        'habitos.habit.streak.um_dia': '1 dia seguido. Continua!',
        'habitos.habit.streak.n_dias': '{n} dias seguidos.',
        'habitos.habit.seo.title_fallback': 'Hábito · Hábitos',
        'habitos.habit.seo.title_template': '{name} · Hábitos',
        'habitos.habit.seo.description': 'Detalhe do hábito',
        'habitos.habit.btn.feito_hoje': 'Marcar como feito hoje',
        'habitos.habit.btn.desfazer': '✓ Feito hoje — desfazer',
        'habitos.habit.cadencia.diaria': 'Hábito diário',
        'habitos.habit.back.voltar': '← Voltar aos hábitos',

        'financas.transacoes.editar.erro.carregar': 'Erro a carregar transação.',
        'financas.transacoes.editar.erro.valor_zero': 'O valor tem de ser maior que zero.',
        'financas.transacoes.editar.erro.sem_categoria': 'Escolhe uma categoria.',
        'financas.transacoes.editar.erro.sem_data': 'Indica uma data.',
        'financas.transacoes.editar.erro.guardar': 'Erro a guardar a transação.',

        'biblioteca.item.toast.removido': 'Marcador removido',
        'biblioteca.item.toast.erro_remover': 'Erro a remover marcador',
        'biblioteca.item.seo.title_com_nome': '{title} · Marcador · Biblioteca',
        'biblioteca.item.seo.title_fallback': 'Marcador · Biblioteca',
        'biblioteca.item.seo.description': 'Detalhe do marcador',
        'biblioteca.item.btn.confirmar': 'Confirmar remoção',
        'biblioteca.item.btn.confirmar_apagar': 'Confirmar apagar?',
        'biblioteca.item.btn.apagando': 'A apagar…',
    },
}

# Update each locale file
LOCALE_FILES = ['pt-PT.json', 'en.json', 'fr.json', 'ar.json', 'tn.json']

for fname in LOCALE_FILES:
    path = f'src/lib/i18n/{fname}'
    with open(path, encoding='utf-8') as f:
        d = json.load(f)

    if fname.startswith('pt-PT'):
        for k, v in NEW_KEYS.items():
            d[k] = v
    else:
        lang = fname.replace('.json', '')
        for k in NEW_KEYS.keys():
            d[k] = TRANSLATIONS[lang][k]

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f'  {fname}: +{len(NEW_KEYS)} keys')

print(f'\nTotal new keys: {len(NEW_KEYS) * 5}')
