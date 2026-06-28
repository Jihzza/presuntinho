"""
Generalised fix: anywhere a string is wrapped as '{$t(...)}' inside a JS
context (function arg, assignment, array literal, etc.) where the braces
were intended as Svelte template syntax, unwrap to $t(...).

Pattern: '{$t(KEY, { default: 'PT' })}'  ->  $t(KEY, { default: 'PT' })
But we also need to handle the case where the value is inside a function
arg, so we should detect contexts where the result is consumed as a value.
"""
import re
from pathlib import Path

root = Path("src")
files_changed = 0
total_fixes = 0

# Match: '{$t( anything balanced up to )}' (greedy within line)
# Use a single-line approach since each occurrence is on its own line.
# Pattern: '  {  $t ( ... )  }  '
# We use a non-greedy match to find the inner content.
# Need to balance parens. Simpler: match a known set of $t( with limited nesting.
# For our case, the inner is "KEY, { default: 'X' }" — only one nested {}.

# We'll iterate over each occurrence of the start "'{$t(" and manually
# track paren depth.

def fix_line(line: str) -> tuple[str, int]:
    fixes = 0
    out = []
    i = 0
    n = len(line)
    while i < n:
        idx = line.find("'{$t(", i)
        if idx == -1:
            out.append(line[i:])
            break
        out.append(line[i:idx])
        # Found start. Now scan to find matching `)}'`
        j = idx + 5  # past the "'{$t("
        depth = 1
        in_str = None
        while j < n and depth > 0:
            c = line[j]
            if in_str:
                if c == "\\" and j + 1 < n:
                    j += 2
                    continue
                if c == in_str:
                    in_str = None
            else:
                if c in ("'", '"'):
                    in_str = c
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                    if depth == 0:
                        # check what follows
                        k = j + 1
                        if k < n and line[k] == "}":
                            k += 1
                            if k < n and line[k] == "'":
                                # We have the full '{$t(...)}'
                                inner = line[idx + 5 : j]
                                out.append(f"$t({inner})")
                                i = k + 1
                                fixes += 1
                                break
            j += 1
        else:
            # Did not find closer; append rest as-is
            out.append(line[idx:])
            i = n
    return "".join(out), fixes


for p in root.rglob("*.svelte"):
    s = p.read_text(encoding="utf-8")
    new_lines = []
    file_fixes = 0
    for line in s.splitlines(keepends=True):
        fixed, n = fix_line(line)
        file_fixes += n
        new_lines.append(fixed)
    if file_fixes:
        new = "".join(new_lines)
        p.write_text(new, encoding="utf-8")
        files_changed += 1
        total_fixes += file_fixes
        print(f"{p}: {file_fixes}")

print(f"TOTAL: {total_fixes} in {files_changed} files")
