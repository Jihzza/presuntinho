#!/usr/bin/env python
"""Helper for Skander2 batch work — counts keys, checks collisions, validates parity across 5 locales."""
import json
import sys
from pathlib import Path

ROOT = Path("src/lib/i18n")
LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]
TARGET_KEYS = sys.argv[1:] if len(sys.argv) > 1 else []


def flat_keys(d, prefix=""):
    out = []
    for k, v in d.items():
        full = f"{prefix}{k}" if not prefix else f"{prefix}.{k}"
        if isinstance(v, dict):
            out.extend(flat_keys(v, full))
        else:
            out.append(full)
    return out


def main():
    data = {}
    for loc in LOCALES:
        path = ROOT / f"{loc}.json"
        data[loc] = json.loads(path.read_text(encoding="utf-8"))

    print("=== Counts (flat top-level entries not nested) ===")
    counts = {}
    all_keys = {}
    for loc, d in data.items():
        keys = flat_keys(d)
        counts[loc] = len(keys)
        all_keys[loc] = set(keys)
        print(f"  {loc}: {len(keys)} keys")

    print()
    if len(set(counts.values())) == 1:
        print(f"  PARITY OK: all 5 locales have {counts[LOCALES[0]]} keys")
    else:
        print(f"  PARITY MISMATCH: {counts}")

    if TARGET_KEYS:
        print()
        print(f"=== Target keys ({len(TARGET_KEYS)}) presence ===")
        for key in TARGET_KEYS:
            row = []
            for loc in LOCALES:
                present = key in all_keys[loc]
                row.append(f"{loc}={'Y' if present else 'N'}")
            print(f"  {key}: {' '.join(row)}")

    # Find keys present in only some locales
    if "--missing" in sys.argv:
        print()
        print("=== Keys present in pt-PT but missing in other locales ===")
        ref = all_keys["pt-PT"]
        for loc in LOCALES:
            if loc == "pt-PT":
                continue
            missing = ref - all_keys[loc]
            if missing:
                print(f"  pt-PT \\ {loc}: {len(missing)} missing")
                for k in sorted(missing)[:20]:
                    print(f"    - {k}")
                if len(missing) > 20:
                    print(f"    ... and {len(missing) - 20} more")


if __name__ == "__main__":
    main()
