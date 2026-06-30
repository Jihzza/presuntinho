import json
import os

base = r'C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n'

for fname in ['pt-PT.json', 'en.json', 'fr.json', 'tn.json', 'ar.json']:
    fp = os.path.join(base, fname)
    d = json.load(open(fp, encoding='utf-8'))
    print(f'\n=== {fname} ===')
    print('top-level keys:', list(d.keys()))
    if 'habitos' in d:
        print('habitos keys:', list(d['habitos'].keys()) if isinstance(d['habitos'], dict) else d['habitos'])
    if 'trabalhos' in d:
        print('trabalhos keys:', list(d['trabalhos'].keys()) if isinstance(d['trabalhos'], dict) else d['trabalhos'])
