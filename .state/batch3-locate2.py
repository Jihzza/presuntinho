"""For each new key, find the EXACT prev and next key in the existing order.
Since JSON objects preserve insertion order (Python 3.7+), we can build
ordered dicts. We'll just identify the immediate predecessor.
"""
import json, os

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

new_keys = {
    'habitos.novo.hero.title':         ('➕ Novo hábito',       '➕ New habit',             '➕ Nouvelle habitude',           '➕ 3ada jdida',         '➕ عادة جديدة'),
    'habitos.novo.criando':            ('A criar…',            'Creating…',                'Création…',                       'Am n-creati…',         'جارٍ الإنشاء…'),
    'habitos.novo.submit.criar':       ('Criar hábito',        'Create habit',             'Créer une habitude',              'Cree 3ada',            'إنشاء عادة'),
    'trabalhos.assignment.loading':    ('A carregar trabalho…','Loading assignment…',      'Chargement du devoir…',           'Am n-chargui el-devoir…','جارٍ تحميل المهمة…'),
    'trabalhos.assignment.file_path':  ('static/data/assignments/equivalenza.json',
                                         'static/data/assignments/equivalenza.json',
                                         'static/data/assignments/equivalenza.json',
                                         'static/data/assignments/equivalenza.json',
                                         'static/data/assignments/equivalenza.json'),
    'trabalhos.assignment.back_to_list':('← Voltar à lista de trabalhos','← Back to assignments list','← Retour à la liste des devoirs','← Rjaa l-liste mel-devoir','← العودة لقائمة المهام'),
}

locale_files = ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']

for fname in locale_files:
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=list)  # preserve order as list of [k,v]
    keys = [k for k, v in data]
    print(f'\n=== {fname} ===')

    for nk in new_keys:
        if nk in dict(data):
            print(f'  COLLISION: {nk}')
            continue
        # find exact prev (last key < nk)
        prev = None
        for k in keys:
            if k < nk:
                prev = k
            else:
                break
        # find exact next (first key > nk)
        nxt = None
        for k in keys:
            if k > nk:
                nxt = k
                break
        print(f'  INSERT {nk!r} AFTER {prev!r} BEFORE {nxt!r}')
