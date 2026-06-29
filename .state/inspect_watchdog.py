import json
d = json.load(open('.state/watchdog-todos.json'))
print('top keys:', list(d.keys()))
print('openItems count:', len(d.get('openItems', [])))
print('closedItems count:', len(d.get('closedItems', [])))
o073 = [o for o in d.get('openItems', []) if o.get('id') == 'gap-073']
o074 = [o for o in d.get('openItems', []) if o.get('id') == 'gap-074']
print('gap-073 in openItems:', len(o073))
print('gap-074 in openItems:', len(o074))
c073 = [c for c in d.get('closedItems', []) if c.get('id') == 'gap-073']
c074 = [c for c in d.get('closedItems', []) if c.get('id') == 'gap-074']
print('gap-073 in closedItems:', len(c073), c073[0] if c073 else None)
print('gap-074 in closedItems:', len(c074), c074[0] if c074 else None)
# show structure of first open and first closed
if d.get('openItems'):
    print('openItem[0] keys:', list(d['openItems'][0].keys()))
if d.get('closedItems'):
    print('closedItem[0] keys:', list(d['closedItems'][0].keys()))
