#!/usr/bin/env python3
"""Show keys added to each locale vs HEAD."""
import subprocess
import json
from collections import Counter
from pathlib import Path

LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]

for locale in LOCALES:
    base = subprocess.check_output(["git", "show", f"HEAD:src/lib/i18n/{locale}.json"], text=True)
    base_keys = set(k for k, _ in json.JSONDecoder(object_pairs_hook=lambda pairs: pairs).decode(base))
    new_path = Path("src/lib/i18n") / f"{locale}.json"
    new_data = json.loads(new_path.read_text(encoding="utf-8"))
    new_keys = set(new_data.keys())
    added = sorted(new_keys - base_keys)
    removed = sorted(base_keys - new_keys)
    print(f"\n=== {locale} ===")
    print(f"  added({len(added)}): {added}")
    if removed:
        print(f"  REMOVED({len(removed)}): {removed}")
