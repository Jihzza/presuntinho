import json, os
os.chdir(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
pt = json.load(open('src/lib/i18n/pt-PT.json'))
others = ['en','tn','fr','ar']
pt_keys = set(pt.keys())
for loc in others:
    o = json.load(open(f'src/lib/i18n/{loc}.json'))
    o_keys = set(o.keys())
    extra_in_others = sorted(o_keys - pt_keys)
    if extra_in_others:
        print(f'\n=== {loc} ({len(extra_in_others)} keys NOT in pt-PT) ===')
        for k in extra_in_others:
            print(f'  {k}')
    extra_in_pt = sorted(pt_keys - o_keys)
    if extra_in_pt:
        print(f'\n=== {loc} MISSING ({len(extra_in_pt)} keys pt-PT has but loc does not) ===')
        for k in extra_in_pt[:20]:
            print(f'  {k}')