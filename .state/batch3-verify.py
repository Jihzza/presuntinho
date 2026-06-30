"""Verify the 6 new keys are present with correct values in all 5 locales."""
import json, os

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

expected = {
    'pt-PT.json': {
        'habitos.novo.hero.title':         '➕ Novo hábito',
        'habitos.novo.criando':            'A criar…',
        'habitos.novo.submit.criar':       'Criar hábito',
        'trabalhos.assignment.loading':    'A carregar trabalho…',
        'trabalhos.assignment.file_path':  'static/data/assignments/equivalenza.json',
        'trabalhos.assignment.back_to_list':'← Voltar à lista de trabalhos',
    },
    'en.json': {
        'habitos.novo.hero.title':         '➕ New habit',
        'habitos.novo.criando':            'Creating…',
        'habitos.novo.submit.criar':       'Create habit',
        'trabalhos.assignment.loading':    'Loading assignment…',
        'trabalhos.assignment.file_path':  'static/data/assignments/equivalenza.json',
        'trabalhos.assignment.back_to_list':'← Back to assignments list',
    },
    'fr.json': {
        'habitos.novo.hero.title':         '➕ Nouvelle habitude',
        'habitos.novo.criando':            'Création…',
        'habitos.novo.submit.criar':       'Créer une habitude',
        'trabalhos.assignment.loading':    'Chargement du devoir…',
        'trabalhos.assignment.file_path':  'static/data/assignments/equivalenza.json',
        'trabalhos.assignment.back_to_list':'← Retour à la liste des devoirs',
    },
    'tn.json': {
        'habitos.novo.hero.title':         '➕ 3ada jdida',
        'habitos.novo.criando':            'Am n-creati…',
        'habitos.novo.submit.criar':       'Cree 3ada',
        'trabalhos.assignment.loading':    'Am n-chargui el-devoir…',
        'trabalhos.assignment.file_path':  'static/data/assignments/equivalenza.json',
        'trabalhos.assignment.back_to_list':'← Rjaa l-liste mel-devoir',
    },
    'ar.json': {
        'habitos.novo.hero.title':         '➕ عادة جديدة',
        'habitos.novo.criando':            'جارٍ الإنشاء…',
        'habitos.novo.submit.criar':       'إنشاء عادة',
        'trabalhos.assignment.loading':    'جارٍ تحميل المهمة…',
        'trabalhos.assignment.file_path':  'static/data/assignments/equivalenza.json',
        'trabalhos.assignment.back_to_list':'← العودة لقائمة المهام',
    },
}

ok = True
for fname in ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']:
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        data = json.load(f)
    print(f'\n=== {fname} ===')
    for k, expected_val in expected[fname].items():
        actual = data.get(k, '<MISSING>')
        match = '✓' if actual == expected_val else '✗'
        if actual != expected_val:
            ok = False
        print(f'  {match} {k}: {actual!r}  (expected: {expected_val!r})')

print('\n' + ('ALL OK' if ok else 'MISMATCHES FOUND'))
