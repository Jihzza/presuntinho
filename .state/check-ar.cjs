const d=JSON.parse(require('fs').readFileSync('src/lib/i18n/ar.json','utf8'));
const t=d.translation||d;
const keys=Object.keys(t);
console.log('ar keys:', keys.length);
console.log('first:', keys[0]);
console.log('last:', keys[keys.length-1]);
// Find duplicate keys
const seen=new Set(); const dups=[];
for(const k of keys){ if(seen.has(k)) dups.push(k); seen.add(k); }
console.log('dup keys in ar:', dups);