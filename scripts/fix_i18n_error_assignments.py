"""
Fix broken i18n patches where $t() was wrapped in single-quote + braces
inside JS string assignments. Convert:   error = '{$t(KEY, { default: X })}';
to:                                            error = $t(KEY, { default: X });
"""
import re
from pathlib import Path

root = Path("src")
files_changed = 0
total_fixes = 0
# Match: error = '{$t( anything until matching ) )};'
# Use a greedy match up to the closing )}';
pat = re.compile(r"error = '\{\$t\((.*?)\)\}';", re.DOTALL)

for p in root.rglob("+page.svelte"):
    s = p.read_text(encoding="utf-8")
    matches = pat.findall(s)
    if not matches:
        continue
    new = pat.sub(lambda m: "error = $t(" + m.group(1) + ");", s)
    p.write_text(new, encoding="utf-8")
    files_changed += 1
    total_fixes += len(matches)
    print(f"{p}: {len(matches)}")

print(f"TOTAL: {total_fixes} in {files_changed} files")
