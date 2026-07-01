import json
import collections

files = ['src/lib/i18n/pt-PT.json','src/lib/i18n/en.json','src/lib/i18n/tn.json','src/lib/i18n/fr.json','src/lib/i18n/ar.json']
datas = {f.split('/')[-1].replace('.json',''): json.load(open(f)) for f in files}

def collect(obj, prefix=''):
    out = []
    for k, v in obj.items():
        full = prefix + k
        if isinstance(v, dict):
            out.extend(collect(v, full + '.'))
        elif isinstance(v, str):
            out.append(full)
    return out

pt_keys = set(collect(datas['pt-PT']))
en_keys = set(collect(datas['en']))
tn_keys = set(collect(datas['tn']))
fr_keys = set(collect(datas['fr']))
ar_keys = set(collect(datas['ar']))

print(f"pt-PT: {len(pt_keys)} keys")
print(f"en:    {len(en_keys)}  (delta vs pt: {len(en_keys)-len(pt_keys)})")
print(f"tn:    {len(tn_keys)}  (delta vs pt: {len(tn_keys)-len(pt_keys)})")
print(f"fr:    {len(fr_keys)}  (delta vs pt: {len(fr_keys)-len(pt_keys)})")
print(f"ar:    {len(ar_keys)}  (delta vs pt: {len(ar_keys)-len(pt_keys)})")
print()
common = pt_keys & en_keys & tn_keys & fr_keys & ar_keys
print(f"5-way intersection: {len(common)} keys")
print(f"Missing in pt-PT (vs en): {len(en_keys - pt_keys)}")
print(f"Missing in en: {len(pt_keys - en_keys)}")
print(f"Missing in tn: {len(pt_keys - tn_keys)}")
print(f"Missing in fr: {len(pt_keys - fr_keys)}")
print(f"Missing in ar: {len(pt_keys - ar_keys)}")
print()
print("Per-section parity (sub-app):")

# Sub-app relevant sections from routes.{escola,financas,habitos,trabalhos,biblioteca,agente}
SECTIONS = ['aulas','agente','auth','biblioteca','caderno','case','financas','habitos','escola','pt','secret','secrets','settings','splash','toast','trabalhos','transacoes','walk','walkthrough','write','common','actions']

for s in SECTIONS:
    pt_c = len([k for k in pt_keys if k.startswith(s+'.')])
    en_c = len([k for k in en_keys if k.startswith(s+'.')])
    tn_c = len([k for k in tn_keys if k.startswith(s+'.')])
    fr_c = len([k for k in fr_keys if k.startswith(s+'.')])
    ar_c = len([k for k in ar_keys if k.startswith(s+'.')])
    base = max(pt_c, en_c, tn_c, fr_c, ar_c) or 1
    parity = 100 * min(pt_c, en_c, tn_c, fr_c, ar_c) / base
    print(f"  {s:18s} pt={pt_c:4d} en={en_c:4d} tn={tn_c:4d} fr={fr_c:4d} ar={ar_c:4d}  parity={parity:.1f}%")
