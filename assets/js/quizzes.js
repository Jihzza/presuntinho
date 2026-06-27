// Quiz data, render, scoring, progress.

// ===========================
// QUIZZES (real answer-checking)
// ===========================
var QUIZZES = {
  q1: [
    {q:'Equivalenza has 528 physical stores in 19 countries', opts:['S','W','O','T'], a:0},
    {q:'The dupe segment collapsed from 37% to 13% of consumers', opts:['S','W','O','T'], a:3},
    {q:'Brand awareness among non-customers is only 30%', opts:['S','W','O','T'], a:1},
    {q:'Gen Z shows the highest fragrance usage growth', opts:['S','W','O','T'], a:2},
    {q:'NPS of 17 (vs Druni 56)', opts:['S','W','O','T'], a:1},
    {q:'Les Secrets is a growing premium line', opts:['S','W','O','T'], a:0},
    {q:'Zara developed high-quality fragrance lines', opts:['S','W','O','T'], a:3},
    {q:'The refill model creates recurring revenue', opts:['S','W','O','T'], a:0},
    {q:'Online sales are only 1% vs market average of 12%', opts:['S','W','O','T'], a:1},
    {q:'The Spanish perfume category grows ~10% annually', opts:['S','W','O','T'], a:2}
  ],
  q2: [
    {q:'Use 528 stores + Les Secrets to capture Gen Z', opts:['SO','WO','ST','WT'], a:0},
    {q:'Build e-commerce to fix the digital gap', opts:['SO','WO','ST','WT'], a:1},
    {q:'Make refill a ritual that Divain can\'t replicate', opts:['SO','WO','ST','WT'], a:0},
    {q:'Consolidate underperformers + rebrand with Morillas', opts:['SO','WO','ST','WT'], a:3},
    {q:'Use franchise network as advantage digital competitors lack', opts:['SO','WO','ST','WT'], a:2},
    {q:'Expand Les Secrets to capture mid-priced migrants', opts:['SO','WO','ST','WT'], a:0}
  ],
  q3: [
    {q:'In what year was Equivalenza founded?', opts:['2009','2011','2013','2015'], a:1},
    {q:'What was the 2023 EBITDA?', opts:['€1M','€2M','€4M','€8M'], a:1},
    {q:'What is Equivalenza\'s NPS?', opts:['17','46','56','72'], a:0},
    {q:'What happened in 2016?', opts:['Expansion to Italy','Les Secrets launch','Lawsuit prohibiting brand references','Franco became CEO'], a:2},
    {q:'What is the average Les Secrets price?', opts:['€10','€15','€20','€25'], a:3},
    {q:'How many stores did Equivalenza have at its 2015 peak?', opts:['528','680','810','1000'], a:2}
  ],
  q4: [
    {q:'Marta sees fragrance primarily as...', opts:['A luxury','A gift','Personal self-expression','A daily necessity'], a:2},
    {q:'How does she discover new fragrances?', opts:['TV','Instagram, TikTok, influencers','Magazines','Physical stores only'], a:1},
    {q:'Her main frustration with Equivalenza is...', opts:['High prices','Inconsistent store experience','Lack of options','Slow delivery'], a:1},
    {q:'Buying dupes matters to Marta because...', opts:['It is cheaper','It confirms she knows value vs. price','It is sustainable','It is faster'], a:1},
    {q:'What would make her choose Equivalenza over a competitor?', opts:['Lower price','An emotionally resonant experience','More stores','Better website'], a:1}
  ],
  ptq: [
    {q:'How do you say "Hello" in Portuguese?', opts:['Olá','Bom dia','Tchau','Adeus'], a:0},
    {q:'What is "obrigado"?', opts:['Please','Thanks','Sorry','You\'re welcome'], a:1},
    {q:'Which verb means "to be (permanent)"?', opts:['estar','ser','ter','ir'], a:1},
    {q:'"Onde fica a biblioteca?" means...', opts:['How much is the library?','Where is the library?','When does the library open?','Is the library nice?'], a:1},
    {q:'"Eu ___ a Fatma" — fill the blank', opts:['estou','tenho','sou','vou'], a:2}
  ]
};

function renderQuiz(quizId, containerId) {
  var container = document.getElementById(containerId);
  var html = '';
  QUIZZES[quizId].forEach(function(item, idx) {
    html += '<div class="quiz-question" data-q="'+quizId+'" data-i="'+idx+'">'+
      '<p>'+(idx+1)+'. '+item.q+'</p>'+
      '<div class="quiz-opts">';
    item.opts.forEach(function(opt, oi) {
      html += '<button class="quiz-opt" data-qi="'+oi+'">'+opt+'</button>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;

  // Attach click handlers
  container.querySelectorAll('.quiz-question').forEach(function(qDiv) {
    var q = qDiv.dataset.q;
    var i = parseInt(qDiv.dataset.i);
    var item = QUIZZES[q][i];

    qDiv.querySelectorAll('.quiz-opt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (qDiv.classList.contains('answered')) return;
        qDiv.classList.add('answered');

        var chosen = parseInt(btn.dataset.qi);
        var correct = item.a;
        var allBtns = qDiv.querySelectorAll('.quiz-opt');

        // Disable all
        allBtns.forEach(function(b){ b.disabled = true; });

        // Mark correct/wrong
        allBtns[correct].classList.add('correct');
        if (chosen !== correct) {
          btn.classList.add('wrong');
        }

        // Score
        if (chosen === correct) {
          state.quizScore[q]++;
          addXP(10);
          if (state.quizScore[q] === QUIZZES[q].length) {
            showToast('🏆 Perfect score on '+q.toUpperCase()+'! +50 XP bonus');
            addXP(50);
            awardBadge('b3');
            // PT quiz perfect = Lusófono badge
            if (q === 'ptq') {
              awardBadge('b11');
              fireConfetti(80);
              showToast('🇵🇹 Lusófono! Falas Português!', 5000);
              var pctEl = document.getElementById('pt-pct');
              if (pctEl) pctEl.textContent = '100';
              var pfEl = document.getElementById('pf-pt');
              if (pfEl) pfEl.style.width = '100%';
            }
          }
        }

        // PT progress bar
        if (q === 'ptq') {
          var pctEl2 = document.getElementById('pt-pct');
          var pfEl2 = document.getElementById('pf-pt');
          var ptpct = Math.round((state.quizScore['ptq'] / QUIZZES['ptq'].length) * 100);
          if (pctEl2) pctEl2.textContent = ptpct;
          if (pfEl2) pfEl2.style.width = ptpct + '%';
        }

        persist();
        updateQuizProgress();
      });
    });
  });
}

function updateQuizProgress() {
  var total = 0;
  var max = 0;
  Object.keys(QUIZZES).forEach(function(q){
    total += (state.quizScore[q] || 0);
    max += QUIZZES[q].length;
  });
  if (max === 0) return;
  var pct = Math.round((total / max) * 100);
  document.getElementById('prog-quiz').textContent = pct+'%';
  document.getElementById('pf-quiz').style.width = pct+'%';
  if (total >= 10) awardBadge('b4');
}
