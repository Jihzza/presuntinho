#!/usr/bin/env python3
"""gap-130: inserir 4 chaves i18n em 5 locales, preservando formatacao."""
import json
import re
from pathlib import Path

ROOT = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
I18N_DIR = ROOT / "src" / "lib" / "i18n"

# 4 keys x 5 locales = 20 entries
ADDITIONS = {
    "financas.shortcuts.reports.title": {
        "pt-PT": "Relatórios",
        "en": "Reports",
        "tn": "Rapports",
        "fr": "Rapports",
        "ar": "تقارير",
    },
    "financas.shortcuts.reports.sub": {
        "pt-PT": "Pie · top 5 · comparativo · CSV",
        "en": "Pie · top 5 · compare · CSV",
        "tn": "Pie · top 5 · compare · CSV",
        "fr": "Camembert · top 5 · comparatif · CSV",
        "ar": "فطيرة · أعلى ٥ · مقارنة · CSV",
    },
    "write.cta.next": {
        "pt-PT": "Seguinte: Lições em PT →",
        "en": "Next: PT Lessons →",
        "tn": "Suivant: Leçons PT →",
        "fr": "Suivant: Leçons PT →",
        "ar": "التالي: دروس PT →",
    },
    "pt.breadcrumb.hub": {
        "pt-PT": "Hub",
        "en": "Hub",
        "tn": "Hub",
        "fr": "Hub",
        "ar": "الرئيسية",
    },
}

# Ordem alfabetica das chaves para cada locale, group-wise
# Reload via JSON parse + dump preserves nothing — we need text-level insert
# to maintain human diff style (alphabetical, no nested change).

# Estrategia: ler JSON como texto, encontrar posicao de insercao via prefix,
# inserir linha(s), validar com json.loads.

def insert_into_json_text(text: str, additions_for_locale: dict[str, str]) -> str:
    """Insert keys in alphabetical position; preserve indent (2 spaces) and trailing newline."""
    # Detectar indent do ficheiro (a primeira key comeca com '  "')
    indent_match = re.search(r'^(\s+)"', text, re.MULTILINE)
    indent = indent_match.group(1) if indent_match else "  "

    # Get all existing keys (preserve order in file)
    existing_keys_order = re.findall(r'^(\s*)"([^"]+)"\s*:', text, re.MULTILINE)

    # Build all keys list (existing + new) sorted alphabetically
    all_keys_sorted = sorted(set(k for _, k in existing_keys_order) | set(additions_for_locale.keys()))

    # Construct new lines
    lines = text.split("\n")
    new_lines = []
    new_keys_set = set(additions_for_locale.keys())
    existing_set = set(k for _, k in existing_keys_order)

    # Build a "merged" view: for each existing line, decide to insert before it
    inserted = set()
    for line in lines:
        # Se linha começa uma key existente
        m = re.match(r'^(\s*)"([^"]+)"\s*:', line)
        if m:
            key = m.group(2)
            # Encontra o sitio desta key no sorted order; insere todas as new keys
            # que venham antes dela.
            for new_key in all_keys_sorted:
                if new_key in new_keys_set and new_key not in inserted:
                    # Esta key vem antes da current key no sort?
                    if new_key < key:
                        new_lines.append(f'{indent}"{new_key}": {json.dumps(additions_for_locale[new_key], ensure_ascii=False)},')
                        inserted.add(new_key)
        new_lines.append(line)

    # Se alguma nao foi inserida (keys com chave > tudo existente), append antes do }
    for new_key in all_keys_sorted:
        if new_key in new_keys_set and new_key not in inserted:
            # find last non-empty line index, que precede "]"
            # Append just before the closing "}"
            for i in range(len(new_lines) - 1, -1, -1):
                if new_lines[i].strip() == "}":
                    # insert before
                    new_lines.insert(i, f'{indent}"{new_key}": {json.dumps(additions_for_locale[new_key], ensure_ascii=False)},')
                    inserted.add(new_key)
                    break

    assert inserted == new_keys_set, f"missed keys: {new_keys_set - inserted}"
    return "\n".join(new_lines)


for locale, value_map in [
    ("pt-PT", {k: ADDITIONS[k]["pt-PT"] for k in ADDITIONS}),
    ("en", {k: ADDITIONS[k]["en"] for k in ADDITIONS}),
    ("tn", {k: ADDITIONS[k]["tn"] for k in ADDITIONS}),
    ("fr", {k: ADDITIONS[k]["fr"] for k in ADDITIONS}),
    ("ar", {k: ADDITIONS[k]["ar"] for k in ADDITIONS}),
]:
    fp = I18N_DIR / f"{locale}.json"
    raw = fp.read_text(encoding="utf-8")
    n_before = raw.count('"\n') + (1 if raw.startswith('"') else 0)

    # Sanity: no duplicates
    for k in ADDITIONS:
        assert f'"{k}"' not in raw, f"DUPLICATE KEY in {fp}: {k}"

    new_text = insert_into_json_text(raw, value_map)

    # Validate JSON parses
    parsed = json.loads(new_text)
    assert len(parsed) == 980 + 4, f"{fp} has {len(parsed)} keys, expected 984"
    for k in ADDITIONS:
        assert parsed[k] == value_map[k], f"value mismatch {fp} {k}: {parsed[k]!r} vs {value_map[k]!r}"

    fp.write_text(new_text, encoding="utf-8")
    print(f"[OK] {fp.name}: {len(parsed)} keys (added 4)")

print("\nAll 5 locales updated. Total keys now: 984.")
