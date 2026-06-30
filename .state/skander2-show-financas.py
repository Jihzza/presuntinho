#!/usr/bin/env python
"""Show top-level finance structure per locale."""
import json
from pathlib import Path

ROOT = Path("src/lib/i18n")
LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]


def flat_keys(d, prefix=""):
    out = []
    for k, v in d.items():
        full = f"{prefix}{k}" if not prefix else f"{prefix}.{k}"
        if isinstance(v, dict):
            out.extend(flat_keys(v, full))
        else:
            out.append(full)
    return out


for loc in LOCALES:
    d = json.loads((ROOT / f"{loc}.json").read_text(encoding="utf-8"))
    print(f"=== {loc} financas structure ===")
    if "financas" not in d:
        print("  (no financas key)")
        continue
    fin = d["financas"]
    for k in sorted(fin.keys()):
        v = fin[k]
        if isinstance(v, dict):
            subkeys = sorted(v.keys())
            print(f"  financas.{k}: dict with {len(subkeys)} keys: {subkeys}")
        else:
            print(f"  financas.{k}: {v!r}")
    print()
