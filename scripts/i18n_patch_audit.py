"""i18n patch audit — find PT strings in aria-label/showToast/error/placeholder
and emit a JSON of replacement plans."""
import re, os, json

REPO = r"C:\Users\rafaa\Documents\GitHub\presuntinho"
roots = [
    os.path.join(REPO, "src/routes/escola"),
    os.path.join(REPO, "src/routes/financas"),
    os.path.join(REPO, "src/routes/habitos"),
    os.path.join(REPO, "src/routes/biblioteca"),
    os.path.join(REPO, "src/routes/trabalhos"),
    os.path.join(REPO, "src/lib/components"),
]

def has_pt(s: str) -> bool:
    return any(c in "áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ" for c in s)

def slugify(s: str, maxlen: int = 28) -> str:
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')[:maxlen]

patches = []
for root in roots:
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(".svelte"):
                continue
            p = os.path.join(dirpath, f)
            relp = os.path.relpath(p, REPO).replace("\\", "/")
            try:
                txt = open(p, encoding="utf-8").read()
            except Exception:
                continue
            for i, line in enumerate(txt.split("\n"), 1):
                if "$t(" in line:
                    continue
                # aria-label="..."
                m = re.search(r'aria-label="([^"]{4,120})"', line)
                if m and has_pt(m.group(1)):
                    s = m.group(1)
                    key = f"a11y.aria.{slugify(s)}"
                    patches.append({
                        "file": relp, "line": i,
                        "old": f'aria-label="{s}"',
                        "new": f'aria-label="{{$t(\'{key}\', {{ default: \'{s}\' }})}}"',
                        "key": key, "pt": s,
                    })
                # showToast('...',
                m = re.search(r"showToast\(\s*'([^']{4,120})'", line)
                if m and has_pt(m.group(1)):
                    s = m.group(1)
                    key = f"toast.{slugify(s)}"
                    patches.append({
                        "file": relp, "line": i,
                        "old": s,
                        "new": f"{{$t('{key}', {{ default: '{s}' }})}}",
                        "key": key, "pt": s,
                    })
                # error = '...';
                m = re.search(r"error\s*=\s*'([^']{4,120})'\s*;", line)
                if m and has_pt(m.group(1)):
                    s = m.group(1)
                    key = f"error.{slugify(s)}"
                    patches.append({
                        "file": relp, "line": i,
                        "old": s,
                        "new": f"{{$t('{key}', {{ default: '{s}' }})}}",
                        "key": key, "pt": s,
                    })
                # placeholder="..."
                m = re.search(r'placeholder="([^"]{4,120})"', line)
                if m and has_pt(m.group(1)):
                    s = m.group(1)
                    key = f"placeholder.{slugify(s)}"
                    patches.append({
                        "file": relp, "line": i,
                        "old": s,
                        "new": f'placeholder="{{$t(\'{key}\', {{ default: \'{s}\' }})}}"',
                        "key": key, "pt": s,
                    })

# Dedupe by (file, line, old)
seen = set(); unique = []
for p in patches:
    k = (p["file"], p["line"], p["old"])
    if k in seen: continue
    seen.add(k); unique.append(p)

print(f"Total unique patches: {len(unique)}")
os.makedirs(os.path.join(REPO, ".state"), exist_ok=True)
out = os.path.join(REPO, ".state/i18n-patch-plan.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(unique, f, ensure_ascii=False, indent=2)
print(f"Wrote plan → {out}")
# print sample
for p in unique[:8]:
    print(f"  {p['file']}:{p['line']} [{p['key']}]")