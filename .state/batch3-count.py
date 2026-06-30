import json, os
base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'
for fname in ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']:
    fp = os.path.join(base, fname)
    data = json.load(open(fp, encoding='utf-8'))
    print(f'{fname}: {len(data)} top-level entries')
