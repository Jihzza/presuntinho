"""Validate JSON files for the gap-072 contabilidade-gerencial delivery."""
import json
import sys
from pathlib import Path

repo = Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
files = [
    repo / "src/lib/i18n/pt-PT.json",
    repo / "src/lib/i18n/en.json",
    repo / "src/lib/i18n/fr.json",
    repo / "src/lib/i18n/tn.json",
    repo / "src/lib/i18n/ar.json",
    repo / "static/lessons/contabilidade-gerencial/course.json",
    repo / "static/quizzes/cgeq.json",
]
for lp in repo.glob("static/lessons/contabilidade-gerencial/*.json"):
    if lp.name != "course.json":
        files.append(lp)

failed = []
for fp in files:
    try:
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "contabilidade-gerencial" in str(fp) and "lesson" in str(fp).lower() or "cgeq" in fp.name:
            if "questions" in data:
                print(f"OK  {fp.relative_to(repo)}  ({len(data['questions'])} quiz questions)")
            elif "sections" in data:
                print(f"OK  {fp.relative_to(repo)}  ({len(data.get('sections', []))} sections)")
            else:
                print(f"OK  {fp.relative_to(repo)}  (keys: {list(data.keys())[:5]})")
        else:
            keys = len(data) if isinstance(data, dict) else 0
            print(f"OK  {fp.relative_to(repo)}  ({keys} keys)")
    except Exception as e:
        print(f"FAIL  {fp.relative_to(repo)}  {e}")
        failed.append(fp)

print()
print(f"Result: {len(files) - len(failed)}/{len(files)} OK, {len(failed)} FAIL")
sys.exit(0 if not failed else 1)
