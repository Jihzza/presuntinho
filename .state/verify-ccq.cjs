const fs = require('fs');
const raw = fs.readFileSync('static/quizzes/ccq.json', 'utf8');
const d = JSON.parse(raw);
console.log('id:', d.id);
console.log('title:', d.title);
console.log('questions:', d.questions.length);
for (let i = 0; i < d.questions.length; i++) {
  const q = d.questions[i];
  console.log(`Q${i + 1}: keys=[${Object.keys(q).join(',')}] opts=${q.opts.length} correctIndex=${q.a} explLen=${q.explanation ? q.explanation.length : 0}`);
}
