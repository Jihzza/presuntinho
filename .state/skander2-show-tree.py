#!/usr/bin/env python
"""Show first-level keys per locale + financas nesting if exists."""
import json
from pathlib import Path

ROOT = Path("src/lib/i18n")
LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]

for loc in LOCALES:
    d = json.loads((ROOT / f"{loc}.json").read_text(encoding="utf-8"))
    top = sorted(d.keys())
    print(f"=== {loc} top-level ({len(top)} keys) ===")
    has_fin = "financas" in d
    print(f"  has financas? {has_fin}")
    if has_fin:
        fin = d["financas"]
        if isinstance(fin, dict):
            for k in sorted(fin.keys()):
                v = fin[k]
                if isinstance(v, dict):
                    subkeys = sorted(v.keys())
                    print(f"    financas.{k}: dict {subkeys}")
                else:
                    print(f"    financas.{k}: {v!r}")
    # Show some hints about where to add it
    finance_related = [k for k in top if "finan" in k.lower()]
    print(f"  finance-related top-level: {finance_related}")
    print()
