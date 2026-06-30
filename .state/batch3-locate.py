"""Locate insertion points for batch-3 new keys in all 5 locale JSON files."""
import json, os

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

# New keys to insert (full dotted keys)
new_keys = [
    'habitos.novo.hero.title',
    'habitos.novo.criando',
    'habitos.novo.submit.criar',
    'trabalhos.assignment.loading',
    'trabalhos.assignment.file_path',
    'trabalhos.assignment.back_to_list',
]

# Map: each key -> key that should come immediately BEFORE it in alphabetical order
# (or None if it goes at the start of its prefix region)
context_keys = {
    'habitos.novo.hero.title': 'habitos.new.name.hint',  # insert after this
    'habitos.novo.criando': 'habitos.novo.cancelar',  # insert after this
    'habitos.novo.submit.criar': 'habitos.novo.sub',  # insert after this
    'trabalhos.assignment.loading': 'trabalhos.assignment.file_path',  # depends on file_path
    'trabalhos.assignment.file_path': 'trabalhos.assignment.breadcrumb.home',  # insert after this
    'trabalhos.assignment.back_to_list': 'toast.transacao_removida',  # last top-level before trabalhos
}

for fname in ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']:
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        data = json.load(f)
    keys = list(data.keys())
    print(f'\n=== {fname} ({len(keys)} keys) ===')

    # First check no collision
    for nk in new_keys:
        if nk in data:
            print(f'  COLLISION: {nk} already exists with value: {data[nk]!r}')
        else:
            # Find the previous key in keys list (lexicographic)
            prev = None
            for k in keys:
                if k < nk:
                    prev = k
                else:
                    break
            print(f'  {nk}: prev = {prev!r}')
