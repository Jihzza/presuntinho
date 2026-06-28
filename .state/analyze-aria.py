import json
import re

with open('src/lib/i18n/pt-PT.json') as f:
    d = json.load(f)

candidates = [
    'Anexar ficheiro', 'Audio walkthrough', 'Data final', 'Data inicial', 'Downloads',
    'Editar marcador', 'Enviar', 'Estudado', 'Fechar', 'Filtrar por categoria',
    'Filtrar por tipo', 'Filtros', 'Frameworks em português', 'Frameworks',
    'Limites por categoria', 'Limpar filtros', 'Limpar histórico', 'Lista de marcadores',
    'Mapa de calor', 'Marcar hoje', 'Notas', 'Percentagem', 'Peso', 'Prazo',
    'Progresso do curso', 'Recursos', 'Segredos', 'Tags', 'Tips de escrita',
    'URL', 'Voltar à lista',
]

# Pre-existing partial matches
existing_partial = [
    'Filtros', 'URL', 'Tags', 'Notas', 'Fechar',  # might already be in routes.* or components
]

def slugify(s):
    out = []
    for ch in s.lower():
        if ch in 'áàâã': out.append('a')
        elif ch in 'éèê': out.append('e')
        elif ch in 'íì': out.append('i')
        elif ch in 'óòôõ': out.append('o')
        elif ch in 'úù': out.append('u')
        elif ch == 'ç': out.append('c')
        elif ch.isalnum(): out.append(ch)
        else: out.append('_')
    slug = ''.join(out).strip('_')
    slug = re.sub(r'_+', '_', slug)
    return slug

for c in candidates:
    matches = [k for k, v in d.items() if c.lower() in v.lower() or c.lower() in k.lower()]
    if matches:
        print(f'  EXISTS: {c!r:38} -> {matches[0]}')
    else:
        print(f'  NEW:    {c!r:38} -> a11y.aria.{slugify(c)}')