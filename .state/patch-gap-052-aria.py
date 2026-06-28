"""gap-052 patch-2: replace remaining hardcoded aria-labels across all .svelte files in src/routes and src/lib/components.

Pattern: aria-label="<PT string>"  ->  aria-label="{$t('a11y.aria.<key>', { default: '<PT string>' })}"
For string interpolations: aria-label={`${foo} ${bar}`} stay as-is.
"""
import re
import json
from pathlib import Path

# Map PT string -> i18n key
PT_TO_KEY = {
    "Anexar ficheiro":         "a11y.aria.anexar_ficheiro",
    "Audio walkthrough":       "a11y.aria.audio_walkthrough",
    "Data final":              "a11y.aria.data_final",
    "Data inicial":            "a11y.aria.data_inicial",
    "Downloads":               "a11y.aria.downloads",
    "Editar marcador":         "a11y.aria.editar_marcador",
    "Enviar":                  "a11y.aria.enviar",
    "Estudado":                "a11y.aria.estudado",
    "Fechar":                  "a11y.aria.fechar",
    "Filtrar por categoria":   "a11y.aria.filtrar_por_categoria",
    "Filtrar por tipo":        "a11y.aria.filtrar_por_tipo",
    "Filtros":                 "a11y.aria.filtros",
    "Frameworks em português": "a11y.aria.frameworks_em_portugues",
    "Frameworks":              "a11y.aria.frameworks",
    "Limites por categoria":   "a11y.aria.limites_por_categoria",
    "Limpar filtros":          "a11y.aria.limpar_filtros",
    "Limpar histórico":        "a11y.aria.limpar_historico",
    "Lista de marcadores":     "a11y.aria.lista_de_marcadores",
    "Mapa de calor":           "a11y.aria.mapa_de_calor",
    "Marcar hoje":             "a11y.aria.marcar_hoje",
    "Notas":                   "a11y.aria.notas",
    "Percentagem":             "a11y.aria.percentagem",
    "Peso":                    "a11y.aria.peso",
    "Prazo":                   "a11y.aria.prazo",
    "Progresso do curso":      "a11y.aria.progresso_do_curso",
    "Recursos":                "a11y.aria.recursos",
    "Segredos":                "a11y.aria.segredos",
    "Tags":                    "a11y.aria.tags",
    "Tips de escrita":         "a11y.aria.tips_de_escrita",
    "URL":                     "a11y.aria.url",
    "Voltar à lista":          "a11y.aria.voltar_a_lista",
}

# Build keys for slug (for ones that match a11y.aria.* OR for the 18 keys we just added)
# Also need to add a11y.aria.filtros, limpar_filtros, audio_walkthrough, downloads, limites_por_categoria,
# mapa_de_calor, notas, peso, prazo, recursos, tags, url if missing (12 keys that already exist as semantically diff)

# Script order:
# 1. Patch .svelte files: replace aria-label="<PT>" with aria-label="{$t('...', { default: '<PT>' })}"
# 2. Add missing i18n keys

# Find all .svelte files with hardcoded aria-labels
root = Path("src")
svelte_files = list(root.rglob("*.svelte"))

patches = []
for f in svelte_files:
    text = f.read_text(encoding="utf-8")
    if "aria-label=" not in text:
        continue
    original = text
    file_patches = []

    # Process line by line to handle exact matches
    for line_match in re.finditer(r'aria-label="([^"$`]+)"', text):
        pt_str = line_match.group(1)
        if pt_str in PT_TO_KEY:
            key = PT_TO_KEY[pt_str]
            replacement = 'aria-label="{$t(\'' + key + '\', { default: \'' + pt_str + "' })}\""
            text = text.replace(f'aria-label="{pt_str}"', replacement, 1)
            file_patches.append((pt_str, key))

    if text != original:
        f.write_text(text, encoding="utf-8")
        patches.append((str(f), file_patches))

# Print summary
for path, plist in patches:
    print(f"\n{path}: {len(plist)} patches")
    for pt, key in plist:
        print(f"  {pt!r:30} -> {key}")

print(f"\n=== TOTAL FILES PATCHED: {len(patches)} ===")
print(f"=== TOTAL PATCHES: {sum(len(p) for _, p in patches)} ===")