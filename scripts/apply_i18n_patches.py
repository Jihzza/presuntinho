"""Apply i18n patches from .state/i18n-patch-plan.json to source files."""
import json, os, re

REPO = r"C:\Users\rafaa\Documents\GitHub\presuntinho"
plan_path = os.path.join(REPO, ".state/i18n-patch-plan.json")
with open(plan_path, encoding="utf-8") as f:
    plan = json.load(f)

# Group by file
by_file = {}
for p in plan:
    by_file.setdefault(p["file"], []).append(p)

applied = 0
for relp, patches in by_file.items():
    full = os.path.join(REPO, relp.replace("/", os.sep))
    with open(full, encoding="utf-8") as f:
        lines = f.read().split("\n")
    # Apply in reverse line order so earlier line indices remain valid
    patches_sorted = sorted(patches, key=lambda x: -x["line"])
    file_changes = 0
    for p in patches_sorted:
        idx = p["line"] - 1
        if idx < 0 or idx >= len(lines):
            print(f"SKIP out-of-range {relp}:{p['line']}")
            continue
        orig = lines[idx]
        if p["old"] not in orig:
            print(f"SKIP not-found {relp}:{p['line']}: {p['old'][:40]}")
            continue
        new_line = orig.replace(p["old"], p["new"])
        lines[idx] = new_line
        file_changes += 1
    if file_changes:
        with open(full, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"{relp}: applied {file_changes}")
        applied += file_changes

print(f"\nTOTAL APPLIED: {applied}")