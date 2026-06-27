"""
Extract CSS, JS modules, and body markup from the monolithic presuntinho.html
into a modular structure for Netlify deployment.
"""
import re, os, shutil

SRC = r'C:\Users\rafaa\Desktop\Code\Projects\Fatma\equivalenza-midterm\presuntinho.html'
DST = r'C:\Users\rafaa\Documents\GitHub\presuntinho'

with open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

css_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
css = css_match.group(1) if css_match else ''

js_match = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
js = js_match.group(1) if js_match else ''

body_match = re.search(r'</head>\s*<body>(.*?)\s*<script>', html, re.DOTALL)
body = body_match.group(1).strip() if body_match else ''

# Fix asset paths: change inline audio refs to relative assets/ paths
body = body.replace('href="audio_intro_en.mp3"', 'href="assets/audio_intro_en.mp3"')
body = body.replace('href="intro_swot.mp3"', 'href="assets/intro_swot.mp3"')
body = body.replace('href="persona_problem.mp3"', 'href="assets/persona_problem.mp3"')
body = body.replace('href="tows_recommendation.mp3"', 'href="assets/tows_recommendation.mp3"')
body = body.replace('href="Equivalenza_Mid_Term_Fatma.pdf"', 'href="docs/Equivalenza_Mid_Term_Fatma.pdf"')
body = body.replace('href="Equivalenza_Mid_Term_Fatma.docx"', 'href="docs/Equivalenza_Mid_Term_Fatma.docx"')

# Split JS into logical modules
def slice_js(start_pattern, end_pattern):
    """Extract a JS block by comment markers."""
    s = re.search(start_pattern, js)
    e = re.search(end_pattern, js[s.start():] if s else '')
    if not s or not e: return ''
    return js[s.start():s.start() + e.end()].strip()

# Use comment markers to slice
def block_between(start_marker, end_marker):
    s_idx = js.find(start_marker)
    if s_idx == -1: return ''
    e_idx = js.find(end_marker, s_idx + len(start_marker))
    if e_idx == -1: return ''
    return js[s_idx:e_idx].strip()

# STATE + BADGES + NAV + TOAST/CONFETTI + EASTER EGGS + BURGER + SECRETS + QUIZZES + INIT
state_block = block_between('// ===========================\n// STATE', '// ===========================\n// NAVIGATION')
nav_block = block_between('// ===========================\n// NAVIGATION', '// ===========================\n// TOAST + CONFETTI')
toast_block = block_between('// ===========================\n// TOAST + CONFETTI', '// ===========================\n// EASTER EGGS')
easter_block = block_between('// ===========================\n// EASTER EGGS', '// ===========================\n// QUIZZES')
quiz_block = block_between('// ===========================\n// QUIZZES', '// ===========================\n// INIT')
init_block = block_between('// ===========================\n// INIT', '// end of script') or js[js.find('// ===========================\n// INIT'):]

# Compose module files
os.makedirs(os.path.join(DST, 'assets', 'css'), exist_ok=True)
os.makedirs(os.path.join(DST, 'assets', 'js'), exist_ok=True)

# styles.css
with open(os.path.join(DST, 'assets', 'css', 'styles.css'), 'w', encoding='utf-8') as f:
    f.write('/* Presuntinho — extracted from inline <style>. V3 base. */\n')
    f.write('/* License: for Fatma BCOBM311 mid-term only. */\n\n')
    f.write(css)
print(f'CSS written: {len(css):,} chars')

# state.js
with open(os.path.join(DST, 'assets', 'js', 'state.js'), 'w', encoding='utf-8') as f:
    f.write('// State, persistence, badges, navigation, toast, confetti.\n')
    f.write('// Loaded first so other modules can use these helpers.\n\n')
    f.write(state_block + '\n\n')
    f.write(nav_block + '\n\n')
    f.write(toast_block + '\n')
print('state.js written')

# easter-eggs.js
with open(os.path.join(DST, 'assets', 'js', 'easter-eggs.js'), 'w', encoding='utf-8') as f:
    f.write('// Easter eggs, burger menu, secrets page.\n')
    f.write('// Depends on state.js (heartClick, logoClick, renderSecrets, etc.).\n\n')
    f.write(easter_block + '\n')
print('easter-eggs.js written')

# quizzes.js
with open(os.path.join(DST, 'assets', 'js', 'quizzes.js'), 'w', encoding='utf-8') as f:
    f.write('// Quiz data, render, scoring, progress.\n\n')
    f.write(quiz_block + '\n')
print('quizzes.js written')

# app.js (init + everything that runs on load)
with open(os.path.join(DST, 'assets', 'js', 'app.js'), 'w', encoding='utf-8') as f:
    f.write('// App init — runs on DOMContentLoaded.\n\n')
    f.write(init_block + '\n')
print('app.js written')

# index.html — body markup only, links to modular assets
index_html = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Presuntinho — Equivalenza Study Hub</title>
<meta name="description" content="Interactive study hub for Fatma's BCOBM311 Mid-Term on Equivalenza. Quizzes, lessons, audio, and a few surprises.">
<meta name="theme-color" content="#1f2e4a">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐷</text></svg>">
<link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>

''' + body + '''

<!-- Modular scripts — order matters -->
<script src="assets/js/state.js"></script>
<script src="assets/js/easter-eggs.js"></script>
<script src="assets/js/quizzes.js"></script>
<script src="assets/js/app.js"></script>
</body>
</html>
'''

with open(os.path.join(DST, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(index_html)
print(f'index.html written: {len(index_html):,} chars')

print('\nDone. Modular structure ready.')
