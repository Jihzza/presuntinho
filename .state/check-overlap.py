import json
for loc in ['pt-PT','en','fr','ar','tn']:
    with open(f'src/lib/i18n/{loc}.json',encoding='utf-8') as f:
        d = json.load(f)
    flat_keys = [k for k in d if k.startswith('a11y.aria.')]
    nested_aria = d.get('a11y',{}).get('aria',{})
    nested_keys = list(nested_aria.keys()) if isinstance(nested_aria, dict) else []
    overlap = set(flat_keys) & set('a11y.aria.'+k for k in nested_keys)
    print(f'{loc}: flat_a11y_aria={len(flat_keys)} nested_a11y_aria={len(nested_keys)} overlap={overlap}')
    nested_plh = d.get('placeholder',{})
    if nested_plh:
        print(f'  placeholder nested keys: {list(nested_plh.keys())}')
    flat_plh = [k for k in d if k.startswith('placeholder.')]
    print(f'  flat placeholder: {len(flat_plh)}')