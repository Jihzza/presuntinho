"""Find {$t(...)} inside HTML attribute string values — this breaks Svelte parsing.

Svelte treats {expr} as template syntax, so { inside a string attribute is a
syntax error in some contexts. We check for patterns like:
  placeholder="{$t('key', { default: 'X' })}"
  aria-label="{$t('key')}"

These need to be unwrapped to just $t(...) WITHOUT the surrounding braces.
"""
import re, os, sys

ROOT = "src"
issues = 0
files = 0
for root, dirs, fs in os.walk(ROOT):
    if 'node_modules' in root:
        continue
    for f in fs:
        if not f.endswith('.svelte'):
            continue
        fp = os.path.join(root, f)
        files += 1
        with open(fp, encoding='utf-8') as fh:
            content = fh.read()
        for m in re.finditer(r'="\{\$t\(', content):
            line_no = content[:m.start()].count('\n') + 1
            line_start = content.rfind('\n', 0, m.start()) + 1
            line_end = content.find('\n', m.end())
            if line_end < 0:
                line_end = len(content)
            line = content[line_start:line_end].strip()
            print(f'{fp}:{line_no}  {line[:140]!r}')
            issues += 1
print(f'TOTAL: {issues} problematic attribute wraps across {files} files')
