#!/usr/bin/env python
"""Add 3 i18n keys × 5 locales, normalize indent, fix gap-097."""
import re
import json
from pathlib import Path

ROOT = Path("src/lib/i18n")

# Key translations (PT is fallback for write.head.title which already exists)
translations = {
    "agente.thinking": {
        "pt-PT": "a pensar…",
        "en": "thinking…",
        "fr": "réflexion…",
        "tn": "ur yerra…",
        "ar": "يفكر…",
    },
    "biblioteca.novo.hero.title": {
        "pt-PT": "➕ Novo marcador",
        "en": "➕ New bookmark",
        "fr": "➕ Nouveau marque-page",
        "tn": "➕ Ammar nucen",
        "ar": "➕ إشارة جديدة",
    },
    "escola.curso.pt.fallbackTitle": {
        "pt-PT": "🇵🇹 Curso de Português",
        "en": "🇵🇹 Portuguese Course",
        "fr": "🇵🇹 Cours de Portugais",
        "tn": "🇵🇹 Tagrada n Tutnuc",
        "ar": "🇵🇹 دورة البرتغالية",
    },
}

# Detect indent: use 2-space standard (pt-PT/ar)
TARGET_INDENT = "  "


def normalize_indent(raw: str) -> str:
    """Strip leading 4-space (or any extra) indent on top-level keys, back to 2."""
    # Match any whitespace + quoted key at line start
    lines = raw.split("\n")
    out = []
    for line in lines:
        # Find top-level key lines: starts with optional whitespace then "
        m = re.match(r"^( +)\"([^\"]+)\":", line)
        if m and len(m.group(1)) != len(TARGET_INDENT):
            line = TARGET_INDENT + line.lstrip()
        out.append(line)
    return "\n".join(out)


def add_keys(raw: str, loc: str) -> str:
    """Add keys in alphabetical order, after the alphabetically-preceding existing key."""
    # Build set of existing keys (already kept ordered in file)
    existing = set()
    for line in raw.split("\n"):
        m = re.match(r'^\s*"([^"]+)":', line)
        if m:
            existing.add(m.group(1))

    new_keys = translations.keys()
    # Insert each key after the alphabetically-preceding existing key
    sorted_existing = sorted(existing)
    lines = raw.split("\n")
    # Process keys in reverse alphabetical order so insertion indices remain stable
    keys_to_add = [k for k in sorted(new_keys, reverse=True) if k not in existing]
    if not keys_to_add:
        # Only normalize indent
        return raw

    for key in keys_to_add:
        value = translations[key][loc]
        # Find insertion point: after the alphabetically-preceding key
        prev = None
        for k in sorted_existing:
            if k < key:
                prev = k
            else:
                break
        if prev is None:
            # Insert at the very top after the opening brace
            for i, line in enumerate(lines):
                if line.strip() == "{":
                    new_line = f'{TARGET_INDENT}"{key}": {json.dumps(value, ensure_ascii=False)},'
                    lines.insert(i + 1, new_line)
                    break
        else:
            # Find the line of prev, insert after it
            for i, line in enumerate(lines):
                if re.match(rf'^\s*"{re.escape(prev)}":', line):
                    new_line = f'{TARGET_INDENT}"{key}": {json.dumps(value, ensure_ascii=False)},'
                    lines.insert(i + 1, new_line)
                    break
        # Update sorted_existing so next key uses updated order
        sorted_existing = sorted(existing | set(keys_to_add))
        existing.add(key)

    return "\n".join(lines)


for loc in ["pt-PT", "en", "fr", "tn", "ar"]:
    p = ROOT / f"{loc}.json"
    raw = p.read_text(encoding="utf-8")
    normalized = normalize_indent(raw)
    new = add_keys(normalized, loc)
    # Validate JSON
    json.loads(new)
    p.write_text(new, encoding="utf-8")
    # Verify
    d = json.loads(new)
    miss = [k for k in translations if k not in d]
    print(f"{loc}: missing after write = {miss if miss else 'NONE — all keys present'}")

print("\n--- Verifying write.head.title parity (gap-097) ---")
for loc in ["pt-PT", "en", "fr", "tn", "ar"]:
    d = json.loads((ROOT / f"{loc}.json").read_text(encoding="utf-8"))
    print(f"  {loc}: {d.get('write.head.title', 'MISSING')}")