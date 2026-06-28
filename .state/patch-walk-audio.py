#!/usr/bin/env python
"""Patch the 2 walk.audio.* keys."""
import json
from pathlib import Path

i18n_dir = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n")

new_keys = {
    "walk.audio.section.h2": {
        "pt-PT": "🎧 Audio walkthroughs",
        "en": "🎧 Audio walkthroughs",
        "fr": "🎧 Guides audio",
        "tn": "🎧 Guides audio",
        "ar": "🎧 شروحات صوتية"
    },
    "walk.audio.intro": {
        "pt-PT": "Ouve enquanto revês. Voz em inglês, 3 faixas que cobrem as 5 secções.",
        "en": "Listen while you review. English voice, 3 tracks covering the 5 sections.",
        "fr": "Écoute pendant que tu révises. Voix anglaise, 3 pistes couvrant les 5 sections.",
        "tn": "Écoute pendant que tu révises. Voix anglaise, 3 pistes couvrant les 5 sections.",
        "ar": "استمع أثناء المراجعة. صوت إنجليزي، 3 مسارات تغطي الأقسام الخمسة."
    }
}

total = 0
for lang in ["pt-PT", "en", "fr", "tn", "ar"]:
    fp = i18n_dir / f"{lang}.json"
    d = json.loads(fp.read_text(encoding="utf-8"))
    added = 0
    for k, v in new_keys.items():
        if k not in d:
            d[k] = v[lang]
            added += 1
    fp.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total += added
    print(f"{lang}.json: +{added} (total {len(d)})")

print(f"DONE total={total}")
