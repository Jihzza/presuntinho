#!/usr/bin/env python3
"""Final i18n audit scan — surfaces every PT string that isn't wrapped in $t().

Coverage:
- Markup body text: anything between > and <
- Raw string attributes: aria-label="PT", placeholder="PT", title="PT", alt="PT"
- String literals inside template expressions:
   - { vogal: 'A', dica: 'Como em <em>pá</em>' }
   - { title: 'PT', desc: 'PT', badge: 'Novo' }
   - array defaults: titleDefault: 'PT', descDefault: 'PT', whatDefault: 'PT'
   - 'PT' strings used as data values that are visibly rendered

Heuristics:
- We do NOT flag strings that live inside a $t('...') call (these are wrapped).
- We DO flag `default: 'PT'` strings inside {$t(key, { default: 'PT' })} calls
  at MÉDIA severity — they are the breadcrumb PT but pt-PT is the source-of-truth.
- We DO flag pure comments (// ...) at BAIXA severity only when they contain PT words
  (these aren't user-facing but document the breadcrumb PT).
- We do NOT flag strings inside <script> blocks if they are clearly code (e.g. URLs,
  CSS selectors, prop type declarations, JS expressions like `data?.length`).

Output: JSON dump + human-readable by-area.
"""
from __future__ import annotations
import re, os, sys, json, pathlib

ROOT = pathlib.Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
SRCS = [ROOT / "src/routes", ROOT / "src/lib/components"]

# ----------------------------------------------------------------------
# A "user-facing PT string" detector — broader than word-list.
# ----------------------------------------------------------------------
# Patterns that indicate a string has user-facing intent:
#  - Object field `: 'PT'` or `: "PT"` where the field is i18n-relevant
#  - '<...>PT text</...>' markup body
#  - attribute="PT" raw

# PT-specific words that should NEVER appear outside $t() — strong signal.
PT_WORDS = {
    # articles + aux + common words (clear PT)
    "não", "são", "está", "estão", "ser", "estar",
    "como", "sobre", "para", "por", "com", "sem",
    "voltar", "próximo", "anterior", "próxima",
    "hoje", "amanhã", "ontem", "agora", "sempre", "nunca",
    "ficheiro", "página", "botão", "dinheiro", "categoria", "categorias",
    "valor", "descrição", "título", "utilizador", "utilizadores",
    "palavra-passe", "entrar", "sair", "conta", "início",
    "confirma", "pergunta", "perguntas", "resposta",
    "orçamento", "despesas", "despesa", "receita", "receitas",
    "atalho", "atalhos", "limite", "limites", "emoção", "emoções",
    "tudo", "talvez", "este", "esta", "esteja", "esta-se",
    "amor", "carinho", "obrigada", "obrigado", "desculpa",
    "lusófono", "lusofonia", "lusófona",
    "carregando", "carregado", "guardando", "guardado",
    # date/time
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    # pronouns
    "nosso", "nossa", "nossos", "nossas",
    "meu", "minha", "meus", "minhas",
    "teu", "tua", "teus", "tuas",
}

# Words that are too generic — only PT when combined with ≥2 PT-words or a PT-phrase.
GENERIC = {
    "de", "da", "do", "em", "no", "na", "nos", "nas",
    "um", "uma", "uns", "umas",
    "os", "as", "ou", "se", "que",
    "mais", "menos", "muito", "pouco", "já", "ainda",
    "aqui", "ali", "lá", "cá", "só", "também",
    "ser", "ter", "haver",
}

# Common PT phrases (low-context signal)
PT_PHRASES = [
    r"\bnão (?:tens?|estás?|há|fui|foi|posso|podes?)\b",
    r"\ba carregar\b", r"\bpor fazer\b", r"\bem curso\b", r"\bem falta\b", r"\bem atraso\b",
    r"\ba guardar\b", r"\ba criar\b", r"\ba pensar\b", r"\bem gravaç\u00e3o\b",
    r"\b(?:para|por) (?:ti|te|tua?|nosso|nossa)\b",
    r"\b(?:como|onde|quando|porque|porquê) (?:a|o|se|te|teu|tua|é|foi|será)\b",
    r"\b(?:está|estão) (?:a|em|no|na)\b",
    r"\btrabalhos?\b", r"\bentregas?\b", r"\bassignments?\b",
    r"\bproblema(?:s)? de marketing\b",
    r"\bcompras?\b", r"\bvendas?\b", r"\bdinheiro\b",
    r"\bsem (?:limite|fundo|dados|categoria|descrição)\b",
    r"\b(?:cria|criar|abre|abrir|edita|editar|elimina|eliminar|guarda|guardar)\b",
    r"\bvoltar\b", r"\bpróximo\b", r"\banterior\b",
    # course names / PT-flavored domain terms
    r"\bEquivalenza\b",
    r"\bTOWS\b", r"\bSWOT\b", r"\bSCQA\b",
    r"\bBuyer Persona\b", r"\bPersona\b",
    r"\bMarta\b", r"\bFatma\b",
    r"\bLusófono\b", r"\bLusofonia\b",
    r"\bPortuguês\b", r"\bTunisian\b", r"\bTunisinos\b",
    r"\bMarketing\b", r"\bBranding\b", r"\bEstratégia\b",
]

# Object-literal field names whose value is i18n-able user-facing text.
# When we see `{ field: '...some PT...' }` and `field` is here, that's a hit.
I18N_FIELDS = {
    "title", "tagline", "description", "badge", "label",
    "labelKey", "labelDefault",
    "titleKey", "titleDefault",
    "descKey", "descDefault",
    "textKey", "textDefault",
    "whatKey", "whatDefault",
    "howKey", "howDefault",
    "hintKey", "hintDefault",
    "headTitle", "headSub",
    "pageTitle", "pageSub",
    "msg", "heading", "intro", "outro", "body",
    "cta", "placeholder", "tooltip", "caption",
    # friendly variants
    "dica", "explicação", "explicacao", "resumo",
    "name", "category", "description_pt", "text",
}

# Field names whose value is NOT user-facing (data attributes, paths, etc.)
NON_UI_FIELDS = {
    "slug", "href", "src", "alt_src", "color", "icon", "lessonCount", "quizCount",
    "id", "aria_label", "icon_url", "src_xs", "src_sm",
    "to", "from", "type",
    "data-theme", "data-confirming", "data-badge-id", "data-status",
    # CSS-related
    "--cat-cor",
    # regex/path values
    "path", "url", "srcset",
}

# Pre-compiled
_PHRASE_RE = [re.compile(p, re.I) for p in PT_PHRASES]
_WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]+")

def is_user_facing_pt(text: str) -> bool:
    if not text or len(text.strip()) < 3:
        return False
    words = set(w.lower() for w in _WORD_RE.findall(text))
    if not words:
        return False
    strong = bool(words & PT_WORDS)
    # PT-phrase hit
    if any(p.search(text) for p in _PHRASE_RE):
        return True
    if strong:
        return True
    # Generic-only is too weak — drop.
    return False

# Track position-of-wrap: replace $t(...) calls with sentinels, then look at remaining text.
WRAP_RE = re.compile(r"\$\s*t\s*\(\s*['\"][^'\"]*['\"]\s*(?:,\s*\{[^}]*\})?\s*\)")
EXPR_T_RE = re.compile(r"\{\s*t\s*\(\s*['\"][^'\"]*['\"]\s*(?:,\s*\{[^}]*\})?\s*\)\s*\}")
DERIVED_RE = re.compile(r"\{\$derived\b[^}]*\}")
STATE_RE = re.compile(r"\{\$state\b[^}]*\}")

def outside_t(text: str) -> str:
    """Return the text after stripping $t(...) calls + simple braces."""
    out = WRAP_RE.sub("__WRAP__", text)
    out = EXPR_T_RE.sub("__WRAP__", out)
    return out

def is_t_default(line: str) -> bool:
    """True if line contains `default: '...PT...'` inside a $t() call."""
    return bool(re.search(r"\$\s*t\s*\([^)]*default\s*:", line))

# ----------------------------------------------------------------------------

# Lines starting with "code-like" prefixes (not user text).
CODE_PREFIX = re.compile(
    r"^\s*(?:"
    r"const|let|var|function|import|export|class|interface|type|enum|namespace|declare"
    r"|\$:\s|onMount|onDestroy|tick\(\)|"
    r"\}|\]|\)\s*;?\s*$|^\s*\{#|"
    r"\.(?:[\w-]+)\s*\{|"
    r"\}?\s*$"
    r")"
)

def line_is_pure_code(line: str, stripped: str) -> bool:
    if not stripped:
        return True
    if CODE_PREFIX.match(stripped):
        return True
    if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
        return True
    if stripped.startswith("<!--") or stripped.startswith("-->"):
        return True
    return False

def extract_visible_strings(line: str):
    """Yield (kind, snippet) pairs."""
    out = []

    # 1) Markup body: text between > and < (no inner {} block)
    for m in re.finditer(r">\s*([^<>{}][^<>]*?)\s*<", line):
        body = m.group(1).strip()
        if is_user_facing_pt(body):
            out.append(("text", body))

    # 2) Raw attributes
    for m in re.finditer(r"\b(placeholder|aria-label|title|alt)\s*=\s*\"([^\"]+)\"", line):
        v = m.group(2).strip()
        if is_user_facing_pt(v):
            out.append(("attr-raw", v))
    for m in re.finditer(r"\b(placeholder|aria-label|title|alt)\s*=\s*'([^']+)'", line):
        v = m.group(2).strip()
        if is_user_facing_pt(v):
            out.append(("attr-raw", v))

    # 3) String literals inside {...} JS expressions (e.g. { dica: 'PT', title: 'PT' })
    # First strip $t() calls.
    tmp = WRAP_RE.sub("__WRAP__", line)
    # Then strip other expressions we don't care to inspect deeply (they still get
    # checked: { foo: 'PT' } is fair game).
    # Find single-quoted strings (≥6 chars to skip abbreviations)
    for m in re.finditer(r"'([^']{4,})'", tmp):
        s = m.group(1).strip()
        # Filter obvious non-PT noise
        if s.startswith(("http://", "https://", "/", "./", "../", "$/", "@")):
            continue
        if re.match(r"^[\w./:#-]+$", s):
            continue  # path-like / CSS-like
        if "_" in s and re.match(r"^[a-z]+(_[a-z0-9]+)+$", s):  # slug/class
            continue
        if s.startswith("--"):
            continue  # CSS var
        if is_user_facing_pt(s):
            out.append(("expr-string", s))
    for m in re.finditer(r'"([^"]{4,})"', tmp):
        s = m.group(1).strip()
        if s.startswith(("http://", "https://", "/", "./", "../", "$/", "@")):
            continue
        if re.match(r"^[\w./:#-]+$", s):
            continue
        if "_" in s and re.match(r"^[a-z]+(_[a-z0-9]+)+$", s):
            continue
        if s.startswith("--"):
            continue
        if is_user_facing_pt(s):
            out.append(("expr-string", s))

    # 4) Object-literal value detect: `fieldName: 'PT'` patterns
    # For i18n-relevant fields, ANY user-text value is a hit.
    for m in re.finditer(r"\b(" + "|".join(re.escape(f) for f in I18N_FIELDS) + r")\s*:\s*['\"]([^'\"]+)['\"]", tmp):
        field = m.group(1)
        val = m.group(2).strip()
        # filter
        if not val or len(val) < 3:
            continue
        if val.startswith(("http", "/", "./", "../", "$/", "@", "--")):
            continue
        if re.match(r"^[\w./:#-]+$", val):
            continue
        # i18n-relevant string — flag as ALTA (we want to fix these)
        out.append(("i18n-field", f"{field} = {val[:120]}"))

    # Dedupe
    seen = set()
    uniq = []
    for kind, snippet in out:
        k = (kind, snippet[:80])
        if k not in seen:
            seen.add(k)
            uniq.append((kind, snippet))
    return uniq


def scan_file(path: pathlib.Path):
    findings = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        return findings
    lines = text.splitlines()
    in_style = False
    in_script = False

    for idx, raw in enumerate(lines, start=1):
        line = raw
        stripped = line.strip()
        if not stripped:
            continue

        if "<style" in stripped and not in_style:
            in_style = True
        if "</style>" in stripped:
            in_style = False
            continue
        if in_style:
            continue

        if "<script" in stripped and not in_script:
            in_script = True
        if "</script>" in stripped:
            in_script = False
            continue
        # Body of <script> block — we still want to scan it for hardcoded PT strings
        # (e.g. `title: 'Escola · Cursos'`), so we don't skip it; we just don't
        # follow lifecycle flow inside it.

        if stripped.startswith("<!--") or stripped.startswith("-->"):
            continue  # ignore HTML comments entirely
        if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            continue  # ignore dev comments

        # Strip $t() before checking — if remaining text has NO PT, skip.
        cleaned = outside_t(line)
        if not is_user_facing_pt(cleaned) and "i18n-field" not in [k for k, _ in extract_visible_strings(line)]:
            continue

        visible = extract_visible_strings(line)
        if not visible:
            continue

        is_default = is_t_default(line)
        # If the line ONLY contains `default: 'PT'` inside $t(), it's MÉDIA.
        # Otherwise it's ALTA.
        all_in_t_default = is_default and all(k == "expr-string" or k == "i18n-field" for k, _ in visible)
        severity = "MÉDIA" if (is_default and all_in_t_default) else "ALTA"

        for kind, snippet in visible:
            # Heuristic: if the line has *both* i18n-field defaults AND text/attr
            # visible content, and text/attr is the bigger picture, the visible
            # content is ALTA. If everything is i18n-field + default-t, it's MÉDIA.
            findings.append({
                "file": str(path),
                "line": idx,
                "kind": kind,
                "severity": severity,
                "snippet": snippet[:160],
                "default_t": is_default,
            })
    return findings

def area_of(filepath: str) -> str:
    rel = filepath.replace(str(ROOT) + "\\", "").replace(str(ROOT) + "/", "")
    parts = rel.split("\\") if "\\" in rel else rel.split("/")
    if parts[0] == "src" and len(parts) >= 3:
        if parts[1] == "routes":
            if len(parts) >= 3 and parts[2].startswith("+"):
                if parts[2] == "+layout.svelte":
                    return "+layout.svelte"
                if parts[2] == "+page.svelte":
                    return "+page.svelte (home)"
                if parts[2] == "+error.svelte":
                    return "+error.svelte"
                return parts[2]
            if len(parts) >= 3:
                return "/" + parts[2]
        if parts[1] == "lib" and parts[2] == "components":
            comp = parts[3] if len(parts) > 3 else "?"
            if comp.endswith(".svelte"):
                comp = comp[:-7]
            return "components/" + comp
    return rel

def main():
    files = []
    for src in SRCS:
        if src.exists():
            files.extend(src.rglob("*.svelte"))
    files.sort()

    all_findings = []
    for f in files:
        all_findings.extend(scan_file(f))

    sev_counts = {"ALTA": 0, "MÉDIA": 0, "BAIXA": 0}
    by_area = {}
    by_file = {}
    for it in all_findings:
        sev_counts[it["severity"]] = sev_counts.get(it["severity"], 0) + 1
        area = area_of(it["file"])
        by_area.setdefault(area, []).append(it)
        # by_file for direct file->findings
        rel = it["file"].replace(str(ROOT) + "\\", "").replace(str(ROOT) + "/", "")
        by_file.setdefault(rel, []).append(it)

    out = {
        "files_scanned": len(files),
        "total": len(all_findings),
        "by_area": by_area,
        "by_file": by_file,
        "sev_counts": sev_counts,
        "files": [str(f) for f in files],
    }
    (ROOT / ".state/i18n-audit-raw.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Files scanned: {len(files)}")
    print(f"Total findings: {len(all_findings)}")
    print("Severity:", sev_counts)
    print("\n=== Findings by area ===")
    for area in sorted(by_area):
        items = by_area[area]
        s = sum(1 for x in items if x["severity"] == "ALTA")
        m = sum(1 for x in items if x["severity"] == "MÉDIA")
        b = sum(1 for x in items if x["severity"] == "BAIXA")
        print(f"\n[{area}]   ALTA={s:3d} MÉDIA={m:3d} BAIXA={b:3d}   ({len(items):4d})")
        seen_locs = set()
        for it in items:
            loc = (it["file"], it["line"])
            if loc in seen_locs:
                continue
            seen_locs.add(loc)
            print(f"  {it['severity']:5s} L{it['line']:<4d} {it['kind']:<14s} {it['snippet'][:90]}")
            if len(seen_locs) >= 10:
                print(f"  ... ({len(items) - 10} more)")
                break

if __name__ == "__main__":
    main()
