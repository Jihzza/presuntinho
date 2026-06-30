#!/usr/bin/env python3
"""Scan Svelte files for hardcoded PT text NOT wrapped in $t() / t().

Heuristics:
- Visible-to-user candidates come from these surfaces:
  (a) Text content between > and < in .svelte markup
  (b) String literals inside `{...}` Svelte expressions that look like PT text
      (catches toast('PT'), aria-label={...`PT ${x}`...}, `{ vogal: 'A', ipa: '/a/', dica: '...' }`)
  (c) Raw string-valued HTML attributes:  aria-label="PT text",  placeholder="PT text",  title="PT text"
      (excluding when value is wrapped in `{...}` like aria-label={x}).
- Lines containing $t('...') ARE exempt — they are wrapped.
- Lines containing default: 'PT' inside a $t() call are flagged as MÉDIA
  (the fallback is hardcoded PT, but in practice it's the dev breadcrumb).
- Pure code lines (let/const/function/import/=/regex/.style bracket) are SKIPPED.
- Comments (// or /* or <!--) are flagged as BAIXA only.
"""
from __future__ import annotations
import re, os, sys, json, pathlib, datetime

ROOT = pathlib.Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
SRCS = [ROOT / "src/routes", ROOT / "src/lib/components"]

# PT words that strongly indicate user-facing PT text.
PT_WORDS = {
    "não", "é", "são", "está", "estão", "para", "como", "sobre",
    "adicionar", "guardar", "carregar", "eliminar", "atualizar", "criar",
    "novo", "nova", "novos", "novas", "abrir", "fechar", "voltar",
    "próximo", "anterior", "próxima", "anteriores",
    "hoje", "amanhã", "ontem", "agora", "sempre", "nunca",
    "ficheiro", "página", "botão", "dinheiro", "categoria", "categorias",
    "valor", "descrição", "título", "data", "hora", "utilizador",
    "utilizadores", "palavra-passe", "entrar", "sair", "conta",
    "início", "confirma", "pergunta", "perguntas", "resposta",
    "etiqueta", "etiquetas", "atalho", "atalhos",
    "tudo", "nada", "talvez", "sim",
    "este", "esta", "estes", "estas",
    "esse", "essa", "esses", "essas",
    "aquele", "aquela", "aqueles", "aquelas",
    "meu", "minha", "meus", "minhas",
    "nosso", "nossa", "nossos", "nossas",
    "amor", "amo-te",
    "português", "lusófono", "lusofonia",
    "próxima", "tarefas", "tarefa",
    "segredo", "segredos",
    "emoção", "emoções", "carinho",
    "obrigado", "obrigada", "desculpa",
    "carregando", "carregado",
    "limite", "limites",
    "orçamento", "orcamento", "transação", "transações", "transacoes",
    "despesa", "despesas", "receita", "receitas",
    "do", "da", "a", "o",  # articles — high FP, use with caution
}

# Common PT multi-word phrases used in this codebase that don't need a strong PT_WORD alone
PT_PHRASES = [
    r"\b(?:não tens?|não foi|não é|não há)\b",
    r"\ba carregar\b",
    r"\bpor fazer\b",
    r"\bdata fixa\b",
    r"\bem curso\b",
    r"\bem falta\b",
    r"\bem atraso\b",
    r"\bpara te\b",
    r"\bpara a tua\b",
    r"\bpara o teu\b",
    r"\bpor (?:isso|isto|aqui|ali)\b",
    r"\b(?:está|estão) a\b",
    r"\bquando (?:a|o|se|te|for)\b",
    r"\b(?:com|sem) (?:a|o|os|as|te|teu|tua)\b",
]

CODE_LINE_PATTERNS = [
    re.compile(r"^\s*(?:const|let|var|function|import|export|class|interface|type)\b"),
    re.compile(r"^\s*\$:\s"),  # $: reactive
    re.compile(r"^\s*<style[\s>]"),  # CSS — inside <style>
    re.compile(r"^\s*[\}\]\)\.]"),  # closing braces
    re.compile(r"^\s*(?:onMount|onDestroy|tick)\("),
    re.compile(r"^\s*//"),  # single-line comment
    re.compile(r"^\s*/\*"),  # block comment
    re.compile(r"^\s*\*"),  # JSDoc line
    re.compile(r"^\s*<!--"),  # HTML comment
    re.compile(r"^\s*-->"),
    re.compile(r"^\s*\.([\w-]+)\s*\{"),  # CSS selector
    re.compile(r"^\s*[\w-]+\s*[:=]"),  # property assignment without PT context
]

def is_strong_pt(text: str) -> bool:
    """True if text contains a PT-specific word or phrase."""
    if not text or len(text.strip()) < 3:
        return False
    lower = text.lower()
    # Strong words
    words = set(re.findall(r"[a-zà-ÿ]+", lower))
    if words & PT_WORDS:
        return True
    # Phrases
    for pat in PT_PHRASES:
        if re.search(pat, lower):
            return True
    return False

# Patterns to strip (so PT words inside them don't count)
#   $t('key', { default: 'PT' })
#   t('key', { default: 'PT' })
#   anything inside {...} that wraps a $t(...) call
WRAPPED_T = re.compile(r"\$\s*t\s*\([^)]*\)")
EXPRESSION = re.compile(r"\{\s*t\s*\([^)]*\)\s*\}")
DERIVED = re.compile(r"\{\$derived[^}]*\}")
STATE = re.compile(r"\{\$state[^}]*\}")

def has_pt_outside_wrappers(line: str) -> bool:
    """Return True if PT words remain in the line after stripping $t(...) and other expressions."""
    cleaned = WRAPPED_T.sub("", line)
    cleaned = EXPRESSION.sub("", cleaned)
    # Don't strip all {...} — we WANT to catch PT inside string literals of expressions.
    # So we keep non-t() braces here.
    return is_strong_pt(cleaned)

def is_t_default(line: str) -> bool:
    """True if the line contains `default: '...PT...'` inside a $t() call
       (which means the PT is the breadcrumb default, not user-visible without locale)."""
    return bool(re.search(r"\$\s*t\s*\([^)]*default\s*:", line))

def extract_visible_strings(line: str) -> list[tuple[str, str]]:
    """Yield (kind, snippet) pairs for user-visible PT strings.
    kinds: 'text' (between tags), 'attr' (raw string attribute), 'expr-string' (PT literal in {...}).
    """
    out = []
    # 1) text between > and <  (on each closing of a tag to next open)
    for m in re.finditer(r">([^<>{}]{2,}?)<", line):
        body = m.group(1).strip()
        if is_strong_pt(body):
            out.append(("text", body))
    # 2) raw attribute values: attr="PT text"  (NOT attr={expr})
    for m in re.finditer(r"\b(placeholder|aria-label|title|alt)\s*=\s*\"([^\"]+)\"", line):
        v = m.group(2).strip()
        if is_strong_pt(v):
            out.append(("attr", v))
    for m in re.finditer(r"\b(placeholder|aria-label|title|alt)\s*=\s*'([^']+)'", line):
        v = m.group(2).strip()
        if is_strong_pt(v):
            out.append(("attr", v))
    # 3) string literals inside {...} that ARE strong PT but not inside $t(...)
    # We strip $t(...) calls first then look at remaining string literals.
    if "{" in line and ("'" in line or '"' in line):
        tmp = WRAPPED_T.sub("__WRAPPED__", line)
        # Find 'PT …' or "PT …" inside non-{...?} chunks where appropriate:
        # Simpler: re.findall for both single- and double-quoted strings longer than 2 chars.
        for m in re.finditer(r"'([^']{4,})'", tmp):
            s = m.group(1).strip()
            if is_strong_pt(s) and "__WRAPPED__" not in tmp[max(0, m.start()-200):m.end()]:
                # Make sure this string isn't inside a $t() (already stripped, so it's not).
                out.append(("expr-string", s))
        for m in re.finditer(r'"([^"]{4,})"', tmp):
            s = m.group(1).strip()
            # Filter noise: URLs, paths, attribute names, CSS
            if s.startswith(("http://", "https://", "/", "./", "../")):
                continue
            if re.match(r"^[\w./:-]+$", s):
                continue  # likely a path or identifier
            if is_strong_pt(s):
                out.append(("expr-string", s))
    # De-dup
    seen = set()
    uniq = []
    for kind, snippet in out:
        key = (kind, snippet[:60])
        if key not in seen:
            seen.add(key)
            uniq.append((kind, snippet))
    return uniq

def classify_line(line: str, stripped: str) -> tuple[str, str]:
    """Return (severity, reason) for the line, or ('', '') to skip."""
    # Drop pure comment-only lines (dev comments)
    if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
        return ("BAIXA", "dev-comment")
    if stripped.startswith("<!--") or stripped.startswith("-->"):
        return ("BAIXA", "html-comment")
    # Drop pure code-only lines (these produce FPs because words like
    # `data`, `categoria`, `eliminar` appear in identifiers).
    if re.match(r"^\s*(?:const|let|var|function|import|export|class|interface|type)\b", stripped):
        return ("BAIXA", "script-decl")
    if re.match(r"^\s*\$:\s", stripped):
        return ("BAIXA", "reactive")
    if re.match(r"^\s*(?:onMount|onDestroy|tick)\(", stripped):
        return ("BAIXA", "lifecycle")
    if re.match(r"^\s*\}?\s*[\.\}\]]?\s*$", stripped):
        return ("BAIXA", "close-bracket")
    return ("", "")


def scan_file(path: pathlib.Path):
    findings = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        return findings

    lines = text.splitlines()
    in_style_block = False
    in_script_block = False

    for idx, raw_line in enumerate(lines, start=1):
        line = raw_line
        stripped = line.strip()
        if not stripped:
            continue

        # Track style/script blocks — skip entirely
        if "<style" in stripped and not in_style_block:
            in_style_block = True
        if "</style>" in stripped:
            in_style_block = False
            continue
        if in_style_block:
            continue
        if "<script" in stripped and not in_script_block:
            in_script_block = True
        if "</script>" in stripped:
            in_script_block = False
            continue
        if in_script_block:
            continue

        sev, reason = classify_line(line, stripped)
        if sev == "BAIXA" and reason in {"dev-comment", "html-comment", "script-decl", "reactive", "lifecycle", "close-bracket"}:
            # Comment-only is fine to ignore — not an i18n target.
            # Code lines we ignore entirely (FPs).
            if reason != "dev-comment" and reason != "html-comment":
                continue
            # Optional: keep dev-comment flagged as BAIXA
            # But for our audit we drop them to reduce noise.
            continue

        # Skip CSS class selectors / inline style rules
        if stripped.startswith(".") and "{" in stripped:
            continue

        # 1) Quick reject: no PT after stripping $t()
        if not has_pt_outside_wrappers(line):
            continue

        # 2) Extract visible PT strings from the line
        visible = extract_visible_strings(line)
        if not visible:
            continue

        # 3) Classify severity
        is_default = is_t_default(line)
        for kind, snippet in visible:
            severity = "MÉDIA" if is_default else "ALTA"
            findings.append({
                "file": str(path),
                "line": idx,
                "kind": kind,
                "severity": severity,
                "snippet": snippet[:160],
                "tag": reason or "hardcoded",
                "default_t": is_default,
            })
    return findings

def area_of(filepath: str) -> str:
    """Map a file path to an area name."""
    rel = filepath.replace(str(ROOT) + "\\", "").replace(str(ROOT) + "/", "")
    parts = rel.split("\\") if "\\" in rel else rel.split("/")
    if parts[0] == "src" and len(parts) >= 3:
        if parts[1] == "routes":
            if parts[2].startswith("+"):
                if parts[2] == "+layout.svelte":
                    return "+layout.svelte"
                if parts[2] == "+page.svelte":
                    return "+page.svelte (home)"
                if parts[2] == "+error.svelte":
                    return "+error.svelte"
                return parts[2]
            else:
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
            for f in src.rglob("*.svelte"):
                files.append(f)
    files.sort()

    all_findings = []
    for f in files:
        all_findings.extend(scan_file(f))

    sev_counts = {"ALTA": 0, "MÉDIA": 0, "BAIXA": 0}
    for it in all_findings:
        sev_counts[it["severity"]] = sev_counts.get(it["severity"], 0) + 1

    print(f"Files scanned: {len(files)}")
    print(f"Total findings: {len(all_findings)}")
    print("Severity:", sev_counts)

    # Group by area
    by_area = {}
    for it in all_findings:
        by_area.setdefault(area_of(it["file"]), []).append(it)

    # Save raw JSON
    out = {
        "files_scanned": len(files),
        "total": len(all_findings),
        "by_area": by_area,
        "sev_counts": sev_counts,
        "files": [str(f) for f in files],
    }
    raw_path = ROOT / ".state/i18n-audit-raw.json"
    raw_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    # Print by-area summary
    print("\n=== Findings by area ===")
    for area in sorted(by_area):
        items = by_area[area]
        s = sum(1 for x in items if x["severity"] == "ALTA")
        m = sum(1 for x in items if x["severity"] == "MÉDIA")
        b = sum(1 for x in items if x["severity"] == "BAIXA")
        print(f"\n[{area}]   ALTA={s} MÉDIA={m} BAIXA={b}   ({len(items)} total)")
        for it in items[:6]:
            print(f"  {it['severity']:5s} L{it['line']:<4d} {it['kind']:<12s} {it['snippet'][:90]}")

if __name__ == "__main__":
    main()
