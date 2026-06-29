import json
needed_keys = [
    'onboarding.welcome.daniel', 'onboarding.welcome.fatma',
    'common.edit', 'common.cancel', 'common.delete', 'common.confirm',
    'common.back', 'common.back_to_course', 'common.back_to_escola',
    'common.clean_filters', 'common.mark_done_today', 'common.undo_done_today',
    'common.add_transaction', 'common.edit_transaction',
    'common.choose_category',
    'a11y.aria.limpar_filtros',
    'a11y.aria.voltar_ao_curso',
    'a11y.aria.voltar_a_escola',
    'a11y.aria.cancelar',
    'a11y.aria.eliminar',
    'a11y.aria.confirmar',
    'a11y.aria.apagar_marcador',
]
for loc in ['pt-PT','en','fr','ar','tn']:
    with open(f'src/lib/i18n/{loc}.json',encoding='utf-8') as f:
        d = json.load(f)
    flat = set(d.keys())
    missing = [k for k in needed_keys if k not in flat]
    print(f'{loc}: missing={missing}')