"""Check i18n coverage for marketing-internacional + mkq across all 5 locales."""
import json, os

repo = r"C:\Users\rafaa\Documents\GitHub\presuntinho"
keys_to_check = [
    "routes.aulas.curso.marketing-internacional.title",
    "routes.aulas.curso.marketing-internacional.tagline",
    "routes.escola.curso.marketing-internacional.title",
    "routes.escola.curso.marketing-internacional.description",
    "routes.escola.curso.marketing-internacional.tagline",
    "routes.escola.quiz.mkq.title",
    "routes.escola.quiz.mkq.description",
]

print(f"{'KEY':<60} {'pt-PT':<8} {'en':<8} {'fr':<8} {'tn':<8} {'ar':<8}")
print("-" * 100)

locales = {}
for loc in ["pt-PT", "en", "fr", "tn", "ar"]:
    path = os.path.join(repo, f"src/lib/i18n/{loc}.json")
    with open(path, encoding="utf-8") as f:
        locales[loc] = json.load(f)

for key in keys_to_check:
    row = [key[:60]]
    for loc in ["pt-PT", "en", "fr", "tn", "ar"]:
        val = locales[loc].get(key, "MISSING")
        marker = "OK" if val != "MISSING" else "!!"
        row.append(marker)
    print(" | ".join(f"{c:<8}" for c in row))

# Counts
print()
for loc in ["pt-PT", "en", "fr", "tn", "ar"]:
    count = sum(1 for k in locales[loc] if "marketing-internacional" in k or ".mkq." in k)
    print(f"{loc}: {count} keys for marketing-internacional/mkq")