"""gap-148 finalize — add 2 final secrets.* keys × 5 locales and patch svelte."""
import json
from pathlib import Path

LOCALES = ["pt-PT", "en", "tn", "fr", "ar"]
BASE = Path("src/lib/i18n")

NEW_KEYS = {
    "secrets.tag.hidden": {
        "pt-PT": "🔐 Escondido",
        "en": "🔐 Hidden",
        "tn": "🔐 Caché",
        "fr": "🔐 Caché",
        "ar": "🔐 مخفي",
    },
    "secrets.heading.h1": {
        "pt-PT": "🔐 Secrets",
        "en": "🔐 Secrets",
        "tn": "🔐 Secrets",
        "fr": "🔐 Secrets",
        "ar": "🔐 Secrets",
    },
}

for loc in LOCALES:
    p = BASE / f"{loc}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in NEW_KEYS.items():
        if k in data:
            continue
        data[k] = v[loc]
        added += 1
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK {loc}: +{added} keys (total {len(data)})")

# Final parity audit
all_keys = set()
for loc in LOCALES:
    data = json.loads((BASE / f"{loc}.json").read_text(encoding="utf-8"))
    keys = set(data.keys())
    all_keys.update(keys)
    missing = all_keys - keys
    if missing:
        print(f"WARN {loc}: missing {len(missing)} keys: {sorted(missing)[:5]}")
    else:
        print(f"OK {loc}: parity {len(keys)}/{len(all_keys)}")

print(f"Total unique keys: {len(all_keys)}")