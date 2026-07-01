#!/usr/bin/env python
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SVELTE_FILE = ROOT / "src/routes/escola/curso/[slug]/+page.svelte"
I18N_DIR = ROOT / "src/lib/i18n"
LOCALES = ["pt-PT", "en", "fr", "ar", "tn"]

NODE_EXTRACTOR = r'''
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('const CATALOGUE');
if (start < 0) throw new Error('CATALOGUE marker not found');
const brace = source.indexOf('{', start);
let depth = 0, end = -1, str = null, esc = false;
for (let i = brace; i < source.length; i++) {
  const c = source[i];
  if (str) {
    if (esc) { esc = false; continue; }
    if (c.charCodeAt(0) === 92) { esc = true; continue; }
    if (c === str) { str = null; continue; }
    continue;
  }
  if (c === '"' || c === "'") { str = c; continue; }
  if (c === '{') depth++;
  if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) throw new Error('CATALOGUE closing brace not found');
process.stdout.write(JSON.stringify(vm.runInNewContext('(' + source.slice(brace, end) + ')')));
'''


def extract_catalogue() -> dict[str, Any]:
    proc = subprocess.run(
        ["node", "-e", NODE_EXTRACTOR, str(SVELTE_FILE)],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"node extractor failed ({proc.returncode}):\n{proc.stderr}")
    return json.loads(proc.stdout, object_pairs_hook=OrderedDict)


def sort_deep(value: Any) -> Any:
    if isinstance(value, dict):
        return OrderedDict((key, sort_deep(value[key])) for key in sorted(value))
    if isinstance(value, list):
        return [sort_deep(item) for item in value]
    return value


def set_path(root: dict[str, Any], parts: list[str], value: str) -> bool:
    node: dict[str, Any] = root
    for part in parts[:-1]:
        child = node.get(part)
        if not isinstance(child, dict):
            child = OrderedDict()
            node[part] = child
        node = child
    old = node.get(parts[-1])
    node[parts[-1]] = value
    return old != value


def flatten_count(value: Any) -> int:
    if isinstance(value, dict):
        return sum(flatten_count(child) for child in value.values())
    return 1


def build_entries(catalogue: dict[str, Any]) -> tuple[list[tuple[list[str], str]], int]:
    entries: list[tuple[list[str], str]] = []
    lessons_count = 0
    for key, course in catalogue.items():
        slug = str(course.get("slug") or key)
        for field in ("title", "tagline", "description"):
            if isinstance(course.get(field), str):
                entries.append((["routes", "escola", "curso", slug, field], course[field]))
        for lesson in course.get("lessons") or []:
            if not isinstance(lesson, dict) or not lesson.get("slug"):
                continue
            lessons_count += 1
            lesson_slug = str(lesson["slug"])
            entries.append((["routes", "escola", "curso", slug, "lessons", lesson_slug, "title"], str(lesson.get("title") or "")))
            entries.append((["routes", "escola", "curso", slug, "lessons", lesson_slug, "summary"], str(lesson.get("summary") or "")))
            entries.append((["routes", "escola", "curso", slug, "lessons", lesson_slug, "quizTitle"], str(lesson.get("quizTitle") or "Quiz")))
    return entries, lessons_count


def main() -> int:
    catalogue = extract_catalogue()
    entries, lessons_count = build_entries(catalogue)
    print(f"extracted courses={len(catalogue)} lessons={lessons_count} generated_paths={len(entries)}")
    totals: dict[str, int] = {}
    for locale in LOCALES:
        path = I18N_DIR / f"{locale}.json"
        backup = path.with_suffix(path.suffix + ".bak")
        if not backup.exists():
            shutil.copy2(path, backup)
        data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=OrderedDict)
        changed = sum(1 for parts, value in entries if set_path(data, parts, value))
        sorted_data = sort_deep(data)
        path.write_text(json.dumps(sorted_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        totals[locale] = flatten_count(sorted_data)
        print(f"{locale}: changed={changed} total_leaf_keys={totals[locale]} backup={backup.name}")
    if len(set(totals.values())) != 1:
        print(f"ERROR: locale parity failed: {totals}", file=sys.stderr)
        return 1
    print(f"parity ok: {next(iter(totals.values()))} leaf keys per locale")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
