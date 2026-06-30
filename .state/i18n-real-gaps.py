#!/usr/bin/env python3
"""Find real PT hardcoded gaps: lines with PT text NOT inside $t() / t() wrappers.
Heuristic: parse each line, ignore anything inside { default: '...' } or $t('...', {...}).
"""
import re, os, pathlib, json

ROOT = pathlib.Path(r"C:\Users\rafaa\Documents\GitHub\presuntinho")
SRCS = [ROOT / "src/routes", ROOT / "src/lib/components"]

PT_WORDS = {
    "não", "é", "são", "está", "estão", "para", "como", "sobre",
    "adicionar", "guardar", "carregar", "eliminar", "atualizar", "criar",
    "novo", "nova", "novos", "novas", "abrir", "fechar", "voltar",
    "próximo", "anterior", "próxima", "anteriores",
    "ficheiro", "página", "botão", "dinheiro", "categoria", "categorias",
    "valor", "descrição", "título", "data", "hora", "utilizador",
    "tudo", "nada", "talvez", "sim",
    "este", "esta", "estes", "estas",
    "aqui", "ali", "lá", "cá",
    "meu", "minha", "meus", "minhas",
    "ainda", "também", "só", "já",
    "muito", "pouco", "mais", "menos",
    "carregar", "carregando", "carregue",
    "carregando", "criando", "criação",
    "voltar", "voltamos", "volta",
    "vogal", "vogais", "fonético",
    "lições", "cursos", "aula", "aulas",
    "marcador", "marcadores",
    "hábito", "hábitos",
    "transação", "transações",
    "categoria", "categorias",
    "trabalho", "trabalhos",
    "salário", "despesa", "despesas", "receita", "receitas",
    "lusófono", "português",
    "marcar", "marcado", "estudado",
}

results = []
for srcdir in SRCS:
    for svelte in srcdir.rglob("*.svelte"):
        try:
            text = svelte.read_text(encoding="utf-8")
        except Exception:
            continue
        lines = text.split("\n")
        in_t_call = False
        for ln, line in enumerate(lines, 1):
            stripped = line.strip()
            # Skip pure $t('key', {...}) calls with PT in default fallback
            if "$t(" in line or "t('" in line or "t(\"" in line:
                # Check if the PT word is inside default: '...'
                if "default:" in line or "default :" in line:
                    continue
            # Skip comments
            if stripped.startswith("//") or stripped.startswith("<!--") or stripped.startswith("*"):
                continue
            # Skip lines with $t already (just in case)
            if re.search(r'\$\s*t\([\'"]', line):
                continue
            # Look for PT words in HTML/JSX
            lower = line.lower()
            words_in_line = re.findall(r'[a-zà-ÿ]+', lower)
            pt_matches = [w for w in words_in_line if w in PT_WORDS]
            if pt_matches:
                # Exclude pure code lines (no text/labels)
                if any(c in line for c in ('"', '<', '>', 'class', '{#', '{/')) or 'placeholder' in line or 'aria-label' in line:
                    rel = svelte.relative_to(ROOT)
                    results.append((str(rel), ln, line.strip()[:120], pt_matches))

# Group by file
by_file = {}
for r in results:
    by_file.setdefault(r[0], []).append(r)

# Filter: only show files with REAL findings (excluding obvious $t wrappers)
print(f"REAL candidates (PT text not inside $t() default): {len(results)}")
print(f"Files affected: {len(by_file)}")
print()
for f, items in sorted(by_file.items()):
    print(f"--- {f} ({len(items)}) ---")
    for it in items[:6]:
        print(f"  L{it[1]}: {it[2]}")
    if len(items) > 6:
        print(f"  ... +{len(items)-6} more")