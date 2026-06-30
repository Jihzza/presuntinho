const j = JSON.parse(require('fs').readFileSync('./.state/watchdog-todos.json', 'utf8'));
console.log('open:', j.openItems.length, 'closed:', j.closedItems.length, 'lastUpdated:', j.lastUpdated);
console.log('open ids:', j.openItems.map(i => i.id).join(','));
console.log('first open:', j.openItems[0].id, '|', j.openItems[0].description.slice(0, 80));