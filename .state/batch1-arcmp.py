#!/usr/bin/env python3
"""Compare keys across locales to find what's missing in ar."""
import json
from pathlib import Path

I18N_DIR = Path("src/lib/i18n")

def load(name):
    return json.loads((I18N_DIR / name).read_text(encoding="utf-8"))

pt = load("pt-PT.json")
ar = load("ar.json")
en = load("en.json")
fr = load("fr.json")
tn = load("tn.json")

all_keys = set(pt) | set(ar) | set(en) | set(fr) | set(tn)

print(f"pt-PT: {len(pt)}, en: {len(en)}, fr: {len(fr)}, tn: {len(tn)}, ar: {len(ar)}")

missing_in_ar = []
for k in sorted(all_keys):
    in_pt = k in pt
    in_en = k in en
    in_fr = k in fr
    in_tn = k in tn
    in_ar = k in ar
    if (in_pt or in_en or in_fr or in_tn) and not in_ar:
        missing_in_ar.append(k)

print(f"\nKeys missing in AR but present in >=1 other: {len(missing_in_ar)}")
for k in missing_in_ar[:60]:
    present_in = [l for l, d in [("pt-PT",pt),("en",en),("fr",fr),("tn",tn)] if k in d]
    print(f"  {k}  ({','.join(present_in)})")
if len(missing_in_ar) > 60:
    print(f"  ... and {len(missing_in_ar)-60} more")
