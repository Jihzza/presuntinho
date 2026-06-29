import urllib.request, json
r = urllib.request.urlopen('https://api.netlify.com/api/v1/sites/presuntinho.netlify.app/deploys?per_page=5', timeout=15)
for d in json.loads(r.read()):
    msg = (d.get('error_message') or '')[:80]
    print(f'{d["id"][:8]} | {d["state"]} | {d.get("commit_ref","?")[:8]} | {msg}')