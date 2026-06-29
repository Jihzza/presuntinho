import os, re
# Heurística: PT literals em .svelte que NÃO estão dentro de $t() nem em aria-label/placeholder/title
pt_words = [
    'Olá', 'Voltar', 'Salvar', 'Guardar', 'Editar', 'Eliminar', 'Apagar',
    'Cancelar', 'Confirmar', 'A carregar', 'Como funciona', 'Definições',
    'Acerca', 'Próximo', 'Anterior', 'Continuar', 'Sair', 'Entrar',
    'Idioma', 'Bem-vindo', 'Bem-vinda', 'Aqui', 'Tudo', 'Nada',
    'Hoje', 'Ontem', 'Amanhã', 'Agora', 'Certo', 'Pronto',
    'Clique', 'Toque', 'Escolhe', 'Adicionar', 'Remover', 'Concluído',
    'Feito', 'Importar', 'Exportar', 'Partilhar', 'Ajuda',
    'Início', 'Principal', 'Página', 'Página inicial',
    'Sem dados', 'Vazio', 'Limpo', 'Limpar', 'Pesquisar',
]
pt_re = re.compile(r'\b(' + '|'.join(pt_words) + r')\b')
hits = []
for root, dirs, files in os.walk('src'):
    if 'i18n' in root: continue
    for f in files:
        if not f.endswith('.svelte'): continue
        p = os.path.join(root,f)
        with open(p,encoding='utf-8') as fh:
            for i,line in enumerate(fh,1):
                # Pula $t(), aria-label, placeholder, title, comments
                stripped = line.strip()
                if stripped.startswith('//'): continue
                if '$t(' in line: continue
                if 'aria-label=' in line: continue
                if 'placeholder=' in line: continue
                if 'title=' in line: continue
                if 'class=' in line and 'description' not in line.lower(): continue
                m = pt_re.search(line)
                if m:
                    # Heurística: só mostra se a palavra aparece em contexto texto (não variável)
                    # ignora se é código (if, return, console, =)
                    if re.search(r'\b(if|else|return|console|import|from|export)\b', line) and '=' in line and '\"' not in line and '“' not in line:
                        continue
                    hits.append((p,i,line.rstrip()[:140]))
print(f'TOTAL_HITS={len(hits)}')
for h in hits[:60]:
    print(f'{h[0]}:{h[1]}: {h[2]}')