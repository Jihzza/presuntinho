"""Insert 6 new keys into all 5 locale JSON files preserving nested structure.

Strategy:
  - Parse with standard json.loads to a real dict.
  - Identify insertion position in the FLAT order (excluding nested sub-keys).
  - Reconstruct by emitting nested objects (a11y, placeholder) as-is and inserting
    flat keys at the right positions.
"""
import json, os, sys, copy

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

# new_keys: list of (key, [pt, en, fr, tn, ar])
new_keys = [
    ('habitos.novo.hero.title',         ['➕ Novo hábito',        '➕ New habit',             '➕ Nouvelle habitude',           '➕ 3ada jdida',         '➕ عادة جديدة']),
    ('habitos.novo.criando',            ['A criar…',             'Creating…',                'Création…',                       'Am n-creati…',         'جارٍ الإنشاء…']),
    ('habitos.novo.submit.criar',       ['Criar hábito',         'Create habit',             'Créer une habitude',              'Cree 3ada',            'إنشاء عادة']),
    ('trabalhos.assignment.loading',    ['A carregar trabalho…', 'Loading assignment…',      'Chargement du devoir…',           'Am n-chargui el-devoir…','جارٍ تحميل المهمة…']),
    ('trabalhos.assignment.file_path',  ['static/data/assignments/equivalenza.json']*5),
    ('trabalhos.assignment.back_to_list',['← Voltar à lista de trabalhos','← Back to assignments list','← Retour à la liste des devoirs','← Rjaa l-liste mel-devoir','← العودة لقائمة المهام']),
]

locale_files = ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']

# Pre-defined insertion positions (verified earlier):
# Format: (new_key, after_key)  -- insert after_key, before next existing key.
# If after_key is None, insert at the start.
positions = {
    'habitos.novo.hero.title':          'habitos.novo.cancelar',
    'habitos.novo.criando':             'habitos.novo.cancelar',
    'habitos.novo.submit.criar':        'habitos.novo.sub',
    'trabalhos.assignment.loading':     'trabalhos.assignment.breadcrumb.home',
    'trabalhos.assignment.file_path':   'trabalhos.assignment.breadcrumb.home',
    'trabalhos.assignment.back_to_list':'toast.transacao_removida',
}

for i, fname in enumerate(locale_files):
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        data = json.load(f)

    # Sanity: no existing keys collide
    for nk, _ in new_keys:
        if nk in data:
            print(f'COLLISION in {fname}: {nk}', file=sys.stderr)
            sys.exit(1)
        # Also check no nested path conflict
        parts = nk.split('.')
        cur = data
        for j, p in enumerate(parts):
            if isinstance(cur, dict):
                if p in cur:
                    cur = cur[p]
                    if isinstance(cur, str) and j < len(parts) - 1:
                        # path through a leaf string — no conflict possible for our flat insertion
                        break
                else:
                    # partial path missing — we need to find a parent that's a dict and insert
                    pass

    # Build the new flat-ordered key list with insertion points applied.
    # We iterate over the existing data in order; when we hit the anchor key, we
    # insert any pending new keys that should go after it (in our positions dict).

    # Group new keys by anchor:
    pending_after = {}  # anchor_key -> list of (new_key, value)
    for j, (nk, vals) in enumerate(new_keys):
        anchor = positions[nk]
        # If anchor is None (would be start), special case; for now all anchors exist.
        if anchor not in pending_after:
            pending_after[anchor] = []
        pending_after[anchor].append((nk, vals[i]))

    # Walk existing data and emit
    new_pairs = []
    inserted = set()
    for k, v in data.items():
        # First, emit any new keys that come BEFORE k and were anchored on previous existing keys
        # (handled by the iteration below after each existing key)
        # Then emit the existing key
        new_pairs.append((k, v))
        # After emitting this key, check if any new keys should be inserted after it
        if k in pending_after:
            for nk, nv in pending_after[k]:
                if nk not in inserted:
                    new_pairs.append((nk, nv))
                    inserted.add(nk)

    # Sanity: all new keys inserted
    if len(inserted) != len(new_keys):
        missing = [nk for nk, _ in new_keys if nk not in inserted]
        print(f'ERROR: not all keys inserted in {fname}, missing: {missing}', file=sys.stderr)
        sys.exit(1)

    # Build final dict preserving insertion order
    new_data = {}
    for k, v in new_pairs:
        new_data[k] = v

    # Write back with 2-space indent, trailing newline (matching repo style)
    with open(fp, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'{fname}: {len(data)} -> {len(new_data)} keys (+{len(new_keys)})')

print('\nDone.')
