#!/usr/bin/env python
"""
check-dup-slugs.py — Regression check: assert NO duplicate `slug:` in
src/routes/escola/+page.svelte COURSES array. Refs gap-tick18/gap-duplicate-slug-gestao-operacoes.

Usage: python .state/scripts/check-dup-slugs.py
Exit: 0 = OK (no dup), 1 = dup found
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "src/routes/escola/+page.svelte"


def main() -> int:
    if not TARGET.exists():
        print(f"ERR: {TARGET} not found", file=sys.stderr)
        return 1
    text = TARGET.read_text(encoding="utf-8")
    # Slug lines live inside the COURSES array literal as `slug: '...',`
    pattern = re.compile(r"slug\s*:\s*['\"]([a-z0-9\-]+)['\"]")
    seen: dict[str, list[int]] = {}
    for line_no, line in enumerate(text.splitlines(), start=1):
        for m in pattern.finditer(line):
            slug = m.group(1)
            seen.setdefault(slug, []).append(line_no)
    dups = {s: lines for s, lines in seen.items() if len(lines) > 1}
    if dups:
        print(f"FAIL: {len(dups)} duplicate slug(s) in {TARGET.name}:")
        for s, lines in dups.items():
            print(f"  slug={s!r}  lines={lines}")
        return 1
    print(f"OK: {len(seen)} unique slugs in {TARGET.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
