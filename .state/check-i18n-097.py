import json, os
base = r'C:/Users/rafaa/Documents/GitHub/presuntinho/src/lib/i18n'
files = ['en.json','fr.json','tn.json','pt-PT.json','ar.json']
all_keys = set()
locales = {}
for f in files:
    p = os.path.join(base, f)
    d = json.load(open(p, encoding='utf-8'))
    locales[f] = d
    all_keys.update(d.keys())
print(f'Total unique keys: {len(all_keys)}')
missing_per_loc = {}
for f, d in locales.items():
    miss = all_keys - set(d.keys())
    if miss:
        missing_per_loc[f] = miss
print(f'Locales with missing keys: {list(missing_per_loc.keys())}')
if missing_per_loc:
    for loc, ks in missing_per_loc.items():
        print(f'  {loc}: {sorted(ks)}')
else:
    print('PARITY 100% across all 5 locales')
# Check write.head.title specifically
print('\nwrite.head.title values:')
for f, d in locales.items():
    print(f'  {f}: {d.get("write.head.title", "MISSING")}')