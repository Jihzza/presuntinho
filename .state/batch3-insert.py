"""Insert 6 new keys into all 5 locale JSON files in correct alphabetic positions."""
import json, os, sys

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

# Per-locale values for each new key (order: pt-PT, en, fr, tn, ar)
new_keys = [
    ('habitos.novo.hero.title',         ['➕ Novo hábito',        '➕ New habit',             '➕ Nouvelle habitude',           '➕ 3ada jdida',         '➕ عادة جديدة']),
    ('habitos.novo.criando',            ['A criar…',             'Creating…',                'Création…',                       'Am n-creati…',         'جارٍ الإنشاء…']),
    ('habitos.novo.submit.criar',       ['Criar hábito',         'Create habit',             'Créer une habitude',              'Cree 3ada',            'إنشاء عادة']),
    ('trabalhos.assignment.loading',    ['A carregar trabalho…', 'Loading assignment…',      'Chargement du devoir…',           'Am n-chargui el-devoir…','جارٍ تحميل المهمة…']),
    ('trabalhos.assignment.file_path',  ['static/data/assignments/equivalenza.json']*5),
    ('trabalhos.assignment.back_to_list',['← Voltar à lista de trabalhos','← Back to assignments list','← Retour à la liste des devoirs','← Rjaa l-liste mel-devoir','← العودة لقائمة المهام']),
]

locale_files = ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']

# Predefined alphabetic insertion positions in pt-PT (script confirmed uniform):
#   habitos.novo.hero.title         -> after 'habitos.novo.cancelar', before 'habitos.novo.iconHint'
#   habitos.novo.criando            -> after 'habitos.novo.cancelar', before 'habitos.novo.iconHint'
#   habitos.novo.submit.criar       -> after 'habitos.novo.sub', before 'habitos.streak.atual'
#   trabalhos.assignment.loading    -> after 'trabalhos.assignment.breadcrumb.home', before 'trabalhos.assignment.o_que_fazer'
#   trabalhos.assignment.file_path  -> after 'trabalhos.assignment.breadcrumb.home', before 'trabalhos.assignment.o_que_fazer'
#   trabalhos.assignment.back_to_list -> after 'toast.transacao_removida', before 'trabalhos.assignment.breadcrumb.home'

# We will compute insertion order dynamically: sort all existing keys + new keys and assign them.

all_new_keys = [k for k, _ in new_keys]

results = {}
for i, fname in enumerate(locale_files):
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        existing = json.load(f, object_pairs_hook=list)  # list of [k,v]
    existing_keys = [k for k, v in existing]
    existing_map = dict(existing)

    # Check no collisions
    for nk in all_new_keys:
        if nk in existing_map:
            print(f'COLLISION in {fname}: {nk}', file=sys.stderr)
            sys.exit(1)

    # Build value map for this locale
    new_values = {}
    for nk, vals in new_keys:
        new_values[nk] = vals[i]

    # Combined sorted list (alphabetic on dotted key)
    combined = list(existing_keys) + list(all_new_keys)
    combined_sorted = sorted(set(combined))

    # Reconstruct: walk combined_sorted, emit [k, v] from existing or new_values
    new_pairs = []
    for k in combined_sorted:
        if k in existing_map:
            new_pairs.append([k, existing_map[k]])
        else:
            new_pairs.append([k, new_values[k]])

    # Save
    with open(fp, 'w', encoding='utf-8') as f:
        json.dump(new_pairs, f, ensure_ascii=False, indent=2)
        f.write('\n')

    added = sum(1 for k in combined_sorted if k not in existing_map)
    results[fname] = (len(combined_sorted), added)
    print(f'{fname}: {len(existing_keys)} -> {len(combined_sorted)} keys (+{added})')

print('\nAll locale JSON files updated.')
for f, (n, a) in results.items():
    print(f'  {f}: total={n}, added={a}')
