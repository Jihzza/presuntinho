import json, os, subprocess, glob, re
ROOT = os.getcwd()
os.chdir(ROOT)

# 1. i18n key counts
print('=== i18n key counts ===')
total_per_locale = {}
all_keys = set()
for f in sorted(os.listdir('src/lib/i18n')):
    if f.endswith('.json'):
        d = json.load(open(f'src/lib/i18n/{f}'))
        total_per_locale[f] = len(d)
        for k in d.keys():
            all_keys.add(k)
        print(f'  {f}: {len(d)} keys')

# 2. find keys missing in some locales
print('\n=== i18n parity check ===')
for f in sorted(os.listdir('src/lib/i18n')):
    if f.endswith('.json'):
        d = json.load(open(f'src/lib/i18n/{f}'))
        missing = all_keys - set(d.keys())
        if missing:
            print(f'  {f} missing {len(missing)} keys: {list(missing)[:5]}...')

# 3. openItems analysis
with open('.state/watchdog-todos.json') as f:
    d = json.load(f)
opens = [i for i in d.get('openItems', []) if not i.get('done')]
print(f'\n=== OPEN ITEMS: {len(opens)} ===')
for i in opens:
    print(f'  {i["id"]} | sev={i.get("severity","?")} | cat={i.get("category","?")} | {i["description"][:140]}')
print(f'\nCLOSED ITEMS: {len(d.get("closedItems", []))}')

# 4. content
lessons = glob.glob('static/lessons/**/*.json', recursive=True)
quizzes = glob.glob('static/quizzes/*.json')
courses = glob.glob('static/courses/*.json') if os.path.isdir('static/courses') else []
print(f'\n=== Content ===')
print(f'  Lessons: {len(lessons)}')
print(f'  Quizzes: {len(quizzes)}')
print(f'  Courses: {len(courses)}')

# 5. Last 10 commits
out = subprocess.run(['git', 'log', '--oneline', '-10'], capture_output=True, text=True)
print('\n=== Last 10 commits ===')
print(out.stdout)

# 6. PT hardcoded strings sweep (quick)
print('\n=== Quick PT hardcoded string sweep in .svelte files ===')
pt_pat = re.compile(r'"[^"]*(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{3,}[^"]*(?:ção|ões|ção|inha|inho|ar|er|ir))[^"]*"')
pt_keywords = ['Carregar', 'Guardar', 'Apagar', 'Voltar', 'Cancelar', 'Adicionar', 'Novo', 'Nova', 'Pesquisar', 'Selecionar', 'Confirmar', 'Continuar']
for root, dirs, files in os.walk('src/routes'):
    for fn in files:
        if not fn.endswith('.svelte'):
            continue
        p = os.path.join(root, fn)
        try:
            content = open(p, encoding='utf-8').read()
        except:
            continue
        for line_no, line in enumerate(content.split('\n'), 1):
            for kw in pt_keywords:
                if f'>{kw}' in line or f' {kw}<' in line or f'"{kw}' in line or f'"{kw} ' in line or f'>{kw} ' in line:
                    # check if not in $t() context
                    if '$t(' not in line and 'placeholder=' in line or f'>{kw}' in line:
                        if 'placeholder=' in line or f'>{kw}' in line or f' {kw}<' in line:
                            print(f'  POTENTIAL: {p}:{line_no}: {line.strip()[:120]}')
                            break
