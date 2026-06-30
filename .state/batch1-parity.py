#!/usr/bin/env python3
"""Parity & validity check for batch-1 i18n."""
import json
import subprocess
import sys
from pathlib import Path

I18N_DIR = Path("src/lib/i18n")
LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]

print("=== JSON validade ===")
all_ok = True
for locale in LOCALES:
    path = I18N_DIR / f"{locale}.json"
    try:
        json.loads(path.read_text(encoding="utf-8"))
        print(f"OK: {path}")
    except Exception as e:
        print(f"FAIL: {path}: {e}")
        all_ok = False

print("=== Parity ===")
counts = {}
for locale in LOCALES:
    path = I18N_DIR / f"{locale}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    counts[locale] = len(d)
    print(f"{path}: {len(d)} keys")

print("=== Diff (any locale out of sync?) ===")
unique_counts = set(counts.values())
if len(unique_counts) == 1:
    print(f"PARITY OK: all 5 locales have {unique_counts.pop()} keys")
else:
    print(f"PARITY FAIL: {counts}")
    all_ok = False

sys.exit(0 if all_ok else 1)
