"""Inspect the structure of each locale JSON to understand nested vs flat regions."""
import json, os

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

for fname in ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']:
    fp = os.path.join(base, fname)
    with open(fp, encoding='utf-8') as f:
        raw = f.read()
    data = json.loads(raw)  # standard parse
    print(f'\n=== {fname} ===')
    print(f'  top-level entries: {len(data)}')
    nested_keys = []
    flat_keys = []
    for k, v in data.items():
        if isinstance(v, dict):
            nested_keys.append(k)
        else:
            flat_keys.append(k)
    print(f'  nested objects ({len(nested_keys)}): {nested_keys}')
    print(f'  flat string values: {len(flat_keys)}')

    # Check that for our new keys, the values are expected to be strings (not nested)
    test = ['habitos.novo.hero.title', 'habitos.novo.criando', 'habitos.novo.submit.criar',
            'trabalhos.assignment.loading', 'trabalhos.assignment.file_path',
            'trabalhos.assignment.back_to_list']
    for tk in test:
        if tk in data:
            v = data[tk]
            print(f'  ALREADY EXISTS: {tk} = {v!r}')
        else:
            # Check if it would conflict with a nested structure
            prefix = tk.split('.')[0]
            if prefix in nested_keys:
                v = data[prefix]
                print(f'  NOTE: {tk} prefix {prefix!r} is nested')
                # walk down
                cur = v
                for part in tk.split('.')[1:]:
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        print(f'  -> partial path missing at {part!r}')
                        cur = None
                        break
                if isinstance(cur, dict):
                    print(f'  -> parent is nested dict: {list(cur.keys())[:5]}...')
                elif isinstance(cur, str):
                    print(f'  -> would CONFLICT with existing nested key {tk}')
                else:
                    print(f'  -> path {tk} is clear')
            else:
                print(f'  {tk}: CLEAR (top-level)')
