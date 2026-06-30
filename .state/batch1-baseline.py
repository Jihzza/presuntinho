#!/usr/bin/env python3
"""Print baseline (HEAD) key counts for each locale using git show."""
import subprocess
import json
from collections import Counter
from pathlib import Path

LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]

for locale in LOCALES:
    out = subprocess.check_output(["git", "show", f"HEAD:src/lib/i18n/{locale}.json"], text=True)
    pairs = json.JSONDecoder(object_pairs_hook=lambda pairs: pairs).decode(out)
    keys = [k for k, _ in pairs]
    counts = Counter(keys)
    unique = len(counts)
    print(f"{locale}: raw_entries={len(pairs)} unique={unique} dups={len([k for k,c in counts.items() if c>1])}")
