#!/usr/bin/env python3
"""Check for duplicate keys (raw parse) and per-key occurrences."""
import json
from collections import OrderedDict, Counter
from pathlib import Path

LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]

for locale in LOCALES:
    path = Path("src/lib/i18n") / f"{locale}.json"
    text = path.read_text(encoding="utf-8")
    # Try strict parsing via json - duplicates are auto-overwritten silently
    # Use object_pairs_hook to detect true duplicates
    try:
        pairs = json.JSONDecoder(object_pairs_hook=lambda pairs: pairs).decode(text)
    except Exception as e:
        print(f"FAIL parse {locale}: {e}")
        continue
    keys = [k for k, _ in pairs]
    counts = Counter(keys)
    dups = [(k, c) for k, c in counts.items() if c > 1]
    print(f"{locale}: total_entries={len(pairs)} unique={len(counts)} dups={len(dups)}")
    for k, c in dups[:20]:
        print(f"  DUP '{k}' x{c}")
