// State, persistence, badges, navigation, toast, confetti.
// Loaded first so other modules can use these helpers.

// ===========================
// STATE (with localStorage)
// ===========================
var state = {
  xp: 0,
  badges: {},
  visited: {},
  heartClicks: 0,
  logoClicks: 0,
  logoTimer: null,
  konamiProg: [],
  keyBuf: '',
  footerClicks: 0,
  quizScore: {q1:0, q2:0, q3:0, q4:0},
  quizAnswered: {q1:[], q2:[], q3:[], q4:[]}
};

// Load persisted state
try {
  var saved = localStorage.getItem('presuntinho');
  if (saved) {
    var parsed = JSON.parse(saved);
    Object.assign(state, parsed);
  }
} catch(e) {}

function persist() {
  try {
    localStorage.setItem('presuntinho', JSON.stringify(state));
  } catch(e) {}
}

// ===========================
// BADGES (15 total)
// ===========================
var BADGES = [
  {id:'b1', icon:'🎯', label:'First Steps'},
  {id:'b2', icon:'📚', label:'Scholar'},
  {id:'b3', icon:'✅', label:'Quiz Whiz'},
  {id:'b4', icon:'🌟', label:'Perfect Score'},
  {id:'b5', icon:'✍️', label:'Wordsmith'},
  {id:'b6', icon:'🧭', label:'Explorer'},
  {id:'b7', icon:'🌸', label:'Scent Discovery'},
  {id:'b8', icon:'🎮', label:'Konami Master'},
  {id:'b9', icon:'🇹🇳', label:'Tunisian Secret'},
  {id:'b10',icon:'🔐', label:'Hidden Room'},
  {id:'b11',icon:'🇵🇹', label:'Lusófono'},
  {id:'b12',icon:'🌟', label:'Heart Legend'},
  {id:'b13',icon:'💯', label:'Heart Centurion'},
  {id:'b14',icon:'🧴', label:'Secret Keeper'},
  {id:'b15',icon:'👣', label:'Footer Detective'}
];

function renderBadges() {
  var grid = document.getElementById('badgeGrid');
  if (!grid) return;
  grid.innerHTML = BADGES.map(function(b){
    var unlocked = state.badges[b.id];
    return '<div class="badge '+(unlocked?'unlocked':'')+'" title="'+b.label+'">'+
      '<div>'+b.icon+'</div>'+
      '<div class="badge-label">'+b.label+'</div>'+
    '</div>';
  }).join('');
  document.getElementById('xpNum').textContent = state.xp;
}

function awardBadge(id, xp) {
  if (state.badges[id]) return;
  state.badges[id] = true;
  if (xp) state.xp += xp;
  persist();
  renderBadges();
  fireConfetti();
}

function addXP(n) {
  state.xp += n;
  persist();
  renderBadges();
}

// ===========================
// NAVIGATION
// ===========================
function navGo(page) {
  // Mark visited
  if (page !== 'home') state.visited[page] = true;

  // Hide all pages
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });

  // Show target
  var pg = document.getElementById('pg-' + page);
  if (pg) pg.classList.add('active');

  // Update nav active state
  document.querySelectorAll('.nav-links a').forEach(function(a){ a.classList.remove('active'); });
  var navLink = document.getElementById('nl-' + page);
  if (navLink) navLink.classList.add('active');

  // Scroll to top
  window.scrollTo({top:0, behavior:'smooth'});

  // Show mascot after first navigation away from home
  if (page !== 'home' && !state.mascotShown) {
    state.mascotShown = true;
    setTimeout(function(){
      document.getElementById('mascot').classList.add('show');
    }, 1500);
  }

  // Update progress
  updateProgress();

  // Award navigation badges
  if (page === 'case') awardBadge('b2');
  if (page === 'quiz') awardBadge('b6');

  // Persist visited state
  persist();
}

function updateProgress() {
  var pages = ['case','course','walk','secrets','quiz','write','pt','dl'];
  var visited = pages.filter(function(p){ return state.visited[p]; }).length;
  var pct = Math.round((visited / pages.length) * 100);
  document.getElementById('prog-read').textContent = pct+'%';
  document.getElementById('pf-read').style.width = pct+'%';
}

// ===========================
// TOAST + CONFETTI
// ===========================
function showToast(msg, duration) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.classList.remove('show'); }, duration || 3000);
}

function fireConfetti(n) {
  n = n || 60;
  var layer = document.getElementById('confettiLayer');
  var colors = ['#d4af37','#b8945a','#9b7ede','#e8b4b8','#4ecdc4','#ff6b9d','#c47891'];
  for (var i = 0; i < n; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
    layer.appendChild(piece);
    setTimeout(function(p){ if(p.parentNode) p.parentNode.removeChild(p); }.bind(null, piece), 4500);
  }
}
