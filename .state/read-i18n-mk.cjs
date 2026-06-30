const fs=require('fs');
for(const loc of ['pt-PT','en','fr','tn','ar']){
  const p='src/lib/i18n/'+loc+'.json';
  const d=JSON.parse(fs.readFileSync(p,'utf8'));
  console.log('=== '+loc+' ===');
  console.log('curso.mk:', JSON.stringify(d.routes?.escola?.curso?.['marketing-internacional']||'MISSING'));
  console.log('aulas.mk:', JSON.stringify(d.routes?.aulas?.curso?.['marketing-internacional']||'MISSING'));
  console.log('quiz.mkq:', JSON.stringify(d.routes?.escola?.quiz?.mkq||'MISSING'));
}
