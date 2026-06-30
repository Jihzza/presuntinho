#!/usr/bin/env python3
"""Batch-1 gap-091: add 11 new escola.* i18n keys × 5 locales."""
import json
from collections import OrderedDict
from pathlib import Path

I18N_DIR = Path("src/lib/i18n")

# 11 new keys × 5 locales. Each entry: (key, dict[locale, value])
NEW_KEYS = [
    ("escola.curso.back_to_school", {
        "pt-PT": "← Voltar à Escola",
        "en":    "← Back to School",
        "fr":    "← Retour à l'École",
        "tn":    "← Rjaa l-Madrasa",
        "ar":    "← الرجوع إلى المدرسة",
    }),
    ("escola.curso.loading", {
        "pt-PT": "A carregar curso…",
        "en":    "Loading course…",
        "fr":    "Chargement du cours…",
        "tn":    "Am n-chargui el-cours…",
        "ar":    "جارٍ تحميل الدورة…",
    }),
    ("escola.curso.pt.badge_inline", {
        "pt-PT": "🎯 Badge: 🇵🇹 Lusófono (b11)",
        "en":    "🎯 Badge: 🇵🇹 Lusophone (b11)",
        "fr":    "🎯 Badge: 🇵🇹 Lusophone (b11)",
        "tn":    "🎯 Badge: 🇵🇹 Lusophone (b11)",
        "ar":    "🎯 Badge: 🇵🇹 ناطق بالبرتغالية (b11)",
    }),
    ("escola.curso.pt.marked_studied", {
        "pt-PT": "✓ Marcado como estudado.",
        "en":    "✓ Marked as studied.",
        "fr":    "✓ Marqué comme étudié.",
        "tn":    "✓ Tmarked khedmet-ha.",
        "ar":    "✓ تم وسمه كمُدروس.",
    }),
    ("escola.curso.pt.quiz.title", {
        "pt-PT": "🇵🇹 Quiz de Português",
        "en":    "🇵🇹 Portuguese Quiz",
        "fr":    "🇵🇹 Quiz de Portugais",
        "tn":    "🇵🇹 Quiz mt3 el-Portugali",
        "ar":    "🇵🇹 اختبار البرتغالية",
    }),
    ("escola.curso.pt.quiz.subtitle", {
        "pt-PT": "5 perguntas · Ganha a badge 🇵🇹 Lusófono (b11) com 5/5 certas.",
        "en":    "5 questions · Earn the 🇵🇹 Lusophone badge (b11) with 5/5 correct.",
        "fr":    "5 questions · Gagne le badge 🇵🇹 Lusophone (b11) avec 5/5 correctes.",
        "tn":    "5 as2ila · Reb7 el-badge 🇵🇹 Lusophone (b11) b 5/5 s7i7.",
        "ar":    "5 أسئلة · اربح شارة 🇵🇹 ناطق بالبرتغالية (b11) بـ 5/5 صحيحة.",
    }),
    ("escola.curso.pt.quiz.back", {
        "pt-PT": "← Voltar ao curso PT",
        "en":    "← Back to PT course",
        "fr":    "← Retour au cours PT",
        "tn":    "← Rjaa l-cours PT",
        "ar":    "← العودة لدورة PT",
    }),
    ("escola.quiz.back_to_course", {
        "pt-PT": "← Voltar ao curso",
        "en":    "← Back to course",
        "fr":    "← Retour au cours",
        "tn":    "← Rjaa l-cours",
        "ar":    "← العودة للدورة",
    }),
    ("escola.walkthrough.loading", {
        "pt-PT": "A carregar walkthrough…",
        "en":    "Loading walkthrough…",
        "fr":    "Chargement du walkthrough…",
        "tn":    "Am n-chargui el-walkthrough…",
        "ar":    "جارٍ تحميل الشرح…",
    }),
    ("escola.walkthrough.not_found", {
        "pt-PT": "Lição não encontrada.",
        "en":    "Lesson not found.",
        "fr":    "Leçon introuvable.",
        "tn":    "El-leçon mech mawjoud.",
        "ar":    "الدرس غير موجود.",
    }),
    ("escola.walkthrough.meta_description", {
        "pt-PT": "Audio walkthrough + transcrição + pontos-chave da lição {lessonSlug}.",
        "en":    "Audio walkthrough + transcript + key points from lesson {lessonSlug}.",
        "fr":    "Audio walkthrough + transcription + points-clés de la leçon {lessonSlug}.",
        "tn":    "Audio walkthrough + transcription + les-points clés mel-leçon {lessonSlug}.",
        "ar":    "شرح صوتي + نص + نقاط رئيسية من الدرس {lessonSlug}.",
    }),
]

LOCALES = ["pt-PT", "en", "fr", "tn", "ar"]


def load(path: Path) -> "OrderedDict[str, str]":
    with path.open(encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=OrderedDict)


def save(path: Path, data: "OrderedDict[str, str]") -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main() -> None:
    summary = []
    for locale in LOCALES:
        path = I18N_DIR / f"{locale}.json"
        data = load(path)
        added = []
        skipped_existing = []
        for key, values in NEW_KEYS:
            if key in data:
                # Collision check
                existing_val = data[key]
                new_val = values[locale]
                if existing_val == new_val:
                    skipped_existing.append((key, "same value"))
                else:
                    skipped_existing.append((key, f"DIFFERENT value existing={existing_val!r} new={new_val!r}"))
                continue
            data[key] = values[locale]
            added.append((key, values[locale]))
        # Re-sort all keys alphabetically
        sorted_data = OrderedDict(sorted(data.items()))
        # Re-check no duplicates
        if len(sorted_data) != len(data):
            raise RuntimeError(f"Duplicate keys after sort in {locale}")
        save(path, sorted_data)
        summary.append((locale, len(added), added, skipped_existing))
        print(f"[{locale}] added={len(added)} skipped_existing={len(skipped_existing)}")
    # Final parity check
    print("--- parity check ---")
    for locale in LOCALES:
        path = I18N_DIR / f"{locale}.json"
        with path.open(encoding="utf-8") as f:
            d = json.load(f)
        print(f"{locale}: {len(d)} keys")
    # Print collision log
    print("--- collision log ---")
    for locale, _, _, skipped in summary:
        for k, msg in skipped:
            print(f"  [{locale}] {k}: {msg}")


if __name__ == "__main__":
    main()
