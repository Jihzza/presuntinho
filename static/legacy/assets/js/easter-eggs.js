// Easter eggs, burger menu, secrets page.
// Depends on state.js (heartClick, logoClick, renderSecrets, etc.).

// ===========================
// EASTER EGGS
// ===========================
var HEART_TIERS = [
  {at:1,    msg:'❤️ Amo-te, presuntinho!',                xp:20, conf:6,  emoji:'❤️'},
  {at:2,    msg:'❤️ +1 amor',                              xp:0,  conf:0,  emoji:'❤️'},
  {at:3,    msg:'💕 Sabes que mais?',                       xp:5,  conf:0,  emoji:'💕'},
  {at:5,    msg:'😘 Já sei que me amas — agora estuda!',   xp:10, conf:0,  emoji:'💕'},
  {at:8,    msg:'💖 Ok, isto é ternura...',                xp:5,  conf:0,  emoji:'💖'},
  {at:10,   msg:'🏆 Presuntinho obsessive detected!',     xp:50, conf:30, emoji:'💖'},
  {at:15,   msg:'💝 Love bombing nivel: avançado.',        xp:10, conf:10, emoji:'💝'},
  {at:20,   msg:'✨ 20 cliques. Still going?',              xp:10, conf:0,  emoji:'💝'},
  {at:25,   msg:'💀 Ok, agora PARE. Vai estudar.',          xp:25, conf:0,  emoji:'💝'},
  {at:30,   msg:'🌹 A rose for your dedication.',           xp:15, conf:20, emoji:'🌹'},
  {at:40,   msg:'🌹🌹 Two roses. Subiu o nível.',           xp:15, conf:0,  emoji:'🌹'},
  {at:50,   msg:'⭐ 50! Half-century of love.',            xp:50, conf:40, emoji:'🌹'},
  {at:75,   msg:'🐷💕 Pig + heart = unbreakable bond.',    xp:30, conf:0,  emoji:'🐷💕'},
  {at:100,  msg:'💯 100 cliques! Centenário do amor.',     xp:100,conf:60, emoji:'🐷💕'},
  {at:150,  msg:'🔥 You\'re in the top tier of clickers.',  xp:50, conf:0,  emoji:'🐷💕'},
  {at:200,  msg:'🌈 200! Rainbow mode activating...',      xp:100,conf:80, emoji:'🌈'},
  {at:300,  msg:'⚡ 300 clicks. Speed-demon territory.',   xp:75, conf:0,  emoji:'🌈'},
  {at:500,  msg:'👑 500! HALF A THOUSAND. Hall of fame.',  xp:200,conf:100,emoji:'👑'},
  {at:750,  msg:'🚀 750 clicks. Approachsing legendary.',  xp:100,conf:0,  emoji:'👑'},
  {at:1000, msg:'🎉 1000! LEGENDARY. Heart transformed.',  xp:500,conf:200,emoji:'🌟'},
  {at:1500, msg:'💎 Beyond legendary. You have no life.',  xp:200,conf:0,  emoji:'💎'},
  {at:2000, msg:'🌟 2000! The heart is now eternal.',      xp:500,conf:0,  emoji:'🌟'},
  {at:5000, msg:'🌌 You have transcended clicking.',       xp:1000,conf:300,emoji:'🌌'},
];

function heartClick() {
  var now = Date.now();
  var clicks = ++state.heartClicks;
  state.heartMaxClicks = Math.max(state.heartMaxClicks || 0, clicks);
  persist();

  // Speed bonus
  var speedBonus = 0;
  if (state.lastHeartClick && (now - state.lastHeartClick) < 350) {
    speedBonus = 1;
  }
  state.lastHeartClick = now;

  // Tier-based effects
  var tier = null;
  for (var i = HEART_TIERS.length - 1; i >= 0; i--) {
    if (clicks === HEART_TIERS[i].at) { tier = HEART_TIERS[i]; break; }
  }

  // Visual intensity escalation
  var btn = document.querySelector('.heart-btn');
  if (btn) {
    btn.classList.remove('intensity-1','intensity-2','intensity-3','intensity-4');
    if (clicks >= 1000) btn.classList.add('intensity-4');
    else if (clicks >= 200) btn.classList.add('intensity-3');
    else if (clicks >= 50) btn.classList.add('intensity-2');
    else if (clicks >= 10) btn.classList.add('intensity-1');
    // Update emoji
    var lastTier = HEART_TIERS.filter(function(t){ return t.at <= clicks; }).pop();
    if (lastTier) btn.textContent = lastTier.emoji;
  }

  // Body pulse on every click past 100
  if (clicks >= 100) {
    document.body.classList.add('heart-pulse');
    setTimeout(function(){ document.body.classList.remove('heart-pulse'); }, 300);
  }

  if (tier) {
    showToast(tier.msg);
    if (tier.xp) addXP(tier.xp);
    if (tier.conf) fireConfetti(tier.conf);
    if (tier.at === 1) awardBadge('b10');
    if (tier.at === 1000) awardBadge('b12');
    if (tier.at === 100) awardBadge('b13');
  } else {
    // Continuous feedback for non-tier clicks
    var speedNote = speedBonus ? ' ⚡speed bonus +5' : '';
    var intensity = Math.floor(Math.log10(clicks + 1));
    showToast((lastTierEmoji(clicks) || '❤️') + ' +1 amor ('+clicks+')' + speedNote, 1800);
    if (speedBonus) addXP(5);
    if (clicks % 5 === 0 && clicks >= 5) addXP(2);
    // Mini confetti for streaks
    if (clicks > 100 && clicks % 10 === 0) fireConfetti(8);
  }
  updateSecretsPage();
}

function lastTierEmoji(n) {
  for (var i = HEART_TIERS.length - 1; i >= 0; i--) {
    if (HEART_TIERS[i].at <= n) return HEART_TIERS[i].emoji;
  }
  return '❤️';
}

function logoClick() {
  if (state.sroomOpened) {
    // Already opened — show only a tiny easter-egg
    showToast('🐷 You already found the Secret Room! Tap the logo 3× to see a hint.', 4000);
    return;
  }
  state.logoClicks++;
  clearTimeout(state.logoTimer);
  state.logoTimer = setTimeout(function(){ state.logoClicks = 0; persist(); }, 3000);

  if (state.logoClicks === 3) {
    fireConfetti();
    showToast('🎉 Logo triple-click! Confetti unlocked!');
    addXP(30);
    persist();
  } else if (state.logoClicks >= 6 && state.logoClicks <= 8) {
    // TOLERANCE: open at 6, 7, OR 8
    showToast('🧴 Welcome to the Secret Room!');
    document.getElementById('sroom').classList.add('show');
    addXP(100);
    awardBadge('b14');
    state.sroomOpened = true;
    persist();
    updateSecretsPage();
  } else if (state.logoClicks === 2) {
    showToast('🐷 One more...');
  } else if (state.logoClicks === 5) {
    showToast('🐷 Almost there... 2 more clicks!');
  } else if (state.logoClicks === 4) {
    showToast('🐷 One more click! 🎯');
  }
}

function mascotClick() {
  var msgs = [
    '🧴 Pro tip: vary your sentence length!',
    '🧴 Pro tip: cite specific numbers from the case!',
    '🧴 Pro tip: SCQA > generic intro',
    '🧴 Pro tip: TOWS without action = waste',
    '🧴 You\'ve got this, Fatma! 💪'
  ];
  showToast(msgs[Math.floor(Math.random()*msgs.length)]);
  addXP(5);
}

function footerClick() {
  state.footerClicks++;
  if (state.footerClicks === 5) {
    showToast('🔐 Try typing "perfume" or "behi" anywhere...');
    state.footerClicks = 0;
    awardBadge('b15');
    persist();
    updateSecretsPage();
  }
}

function closeSRoom(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('sroom').classList.remove('show');
}

// ===========================
// SECRETS PAGE (progressive unlock hint map)
// ===========================
var SECRET_DEFS = [
  {id:'heart',    icon:'❤️',  name:'The Loving Heart',     hint:'Click the heart button. A lot.',                                            reward:'+20 XP + confetti at click 1, escalating rewards up to 1000 clicks',  badge:'b10'},
  {id:'logo3',    icon:'🐷',  name:'Pig Triple-Click',     hint:'Click the 🐷 logo 3 times within 3 seconds.',                              reward:'+30 XP + confetti + unlocks Pig Hunter mode',                        badge:null},
  {id:'logo7',    icon:'🧴',  name:'The Secret Room',      hint:'Click the 🐷 logo 6–8 times within 3 seconds. (Tolerance: 6, 7 or 8!)',  reward:'+100 XP + Secret Room opens + 5 perfume facts',                     badge:'b14'},
  {id:'konami',   icon:'🎮',  name:'Konami Code',          hint:'Press ↑ ↑ ↓ ↓ ← → ← → B A anywhere on the page.',                        reward:'+100 XP + Konami Master badge + confetti',                           badge:'b8'},
  {id:'perfume',  icon:'🌸',  name:'Scent Discovery',      hint:'Type the word "perfume" anywhere.',                                        reward:'+50 XP + Scent Discovery badge + confetti',                          badge:'b7'},
  {id:'behi',     icon:'🇹🇳', name:'Tunisian Greeting',    hint:'Type the Tunisian word "behi" (means "beautiful") anywhere.',             reward:'+50 XP + Tunisian Secret badge + confetti',                         badge:'b9'},
  {id:'mascot',   icon:'🧴',  name:'Mascot Pro-Tips',      hint:'Click the 🧴 mascot (appears after first navigation).',                    reward:'Random writing pro-tips + +5 XP per click',                          badge:null},
  {id:'footer',   icon:'👣',  name:'Footer Detective',     hint:'Click the footer text 5 times.',                                           reward:'Hint toast about perfume/behi + Footer Detective badge',             badge:'b15'},
];

function isSecretUnlocked(id) {
  var s = SECRET_DEFS.find(function(x){ return x.id === id; });
  if (!s) return false;
  if (s.badge && state.badges[s.badge]) return true;
  // non-badge unlocks
  if (id === 'heart') return (state.heartMaxClicks || 0) >= 1;
  if (id === 'logo3') return state.logoClicks >= 3;
  if (id === 'mascot') return Object.keys(state.visited).length >= 4;
  return false;
}

function renderSecrets() {
  var grid = document.getElementById('secretsGrid');
  if (!grid) return;
  var html = '';
  for (var i = 0; i < SECRET_DEFS.length; i++) {
    var s = SECRET_DEFS[i];
    var unlocked = isSecretUnlocked(s.id);
    var discoveredAt = state.secretDiscovered && state.secretDiscovered[s.id];
    html += '<div class="secret-card '+(unlocked?'unlocked':'locked')+'" data-id="'+s.id+'">'+
      '<span class="secret-status">'+(unlocked?'UNLOCKED':'LOCKED')+'</span>'+
      '<h3>'+s.icon+' '+s.name+'</h3>'+
      '<div class="secret-hint">💡 '+s.hint+'</div>'+
      '<div class="secret-reward">'+(unlocked ? s.reward : 'Reward: ████████ (locked)')+'</div>'+
      (discoveredAt ? '<div class="secret-discovered">📅 Discovered: '+new Date(discoveredAt).toLocaleString()+'</div>' : '')+
    '</div>';
  }
  var discovered = SECRET_DEFS.filter(function(s){ return isSecretUnlocked(s.id); }).length;
  var head = document.getElementById('secretsHeader');
  if (head) head.textContent = discovered + ' / ' + SECRET_DEFS.length + ' discovered';
  grid.innerHTML = html;
}

function updateSecretsPage() {
  var s = SECRET_DEFS.find(function(x){
    if (x.badge && state.badges[x.badge] && !(state.secretDiscovered && state.secretDiscovered[x.id])) return true;
    if (x.id === 'heart' && (state.heartMaxClicks||0) >= 1 && !(state.secretDiscovered && state.secretDiscovered[x.id])) return true;
    if (x.id === 'logo3' && state.logoClicks >= 3 && !(state.secretDiscovered && state.secretDiscovered[x.id])) return true;
    if (x.id === 'mascot' && Object.keys(state.visited).length >= 4 && !(state.secretDiscovered && state.secretDiscovered[x.id])) return true;
    return false;
  });
  if (s) {
    state.secretDiscovered = state.secretDiscovered || {};
    state.secretDiscovered[s.id] = Date.now();
    fireConfetti(20);
    showToast('🔓 New secret discovered: '+s.icon+' '+s.name);
    persist();
  }
  renderSecrets();
}

// ===========================
// BURGER MENU
// ===========================
function initBurger() {
  var btn = document.getElementById('burgerBtn');
  var links = document.getElementById('navLinks');
  if (!btn || !links) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = links.classList.toggle('open');
    btn.textContent = isOpen ? '✕' : '☰';
    document.body.classList.toggle('menu-open', isOpen);
  });
  // Close on link click
  links.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      links.classList.remove('open');
      btn.textContent = '☰';
      document.body.classList.remove('menu-open');
    });
  });
  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && links.classList.contains('open')) {
      links.classList.remove('open');
      btn.textContent = '☰';
      document.body.classList.remove('menu-open');
    }
  });
  // Close on outside click
  document.addEventListener('click', function(e) {
    if (links.classList.contains('open') && !links.contains(e.target) && e.target !== btn) {
      links.classList.remove('open');
      btn.textContent = '☰';
      document.body.classList.remove('menu-open');
    }
  });
}

// ===========================
// KEYBOARD EASTER EGGS
// ===========================
document.addEventListener('keydown', function(e) {
  // Konami code
  var konami = [38,38,40,40,37,39,37,39,66,65];
  state.konamiProg.push(e.keyCode);
  if (state.konamiProg.length > konami.length) state.konamiProg.shift();
  if (state.konamiProg.join(',') === konami.join(',')) {
    showToast('🎮 KONAMI CODE! +100 XP');
    addXP(100);
    awardBadge('b8');
    fireConfetti();
    state.konamiProg = [];
  }

  // Keyword buffer
  if (e.key.length === 1) {
    state.keyBuf += e.key.toLowerCase();
    if (state.keyBuf.length > 20) state.keyBuf = state.keyBuf.slice(-20);

    if (state.keyBuf.indexOf('perfume') >= 0) {
      showToast('🌸 Scent Discovery! You smell the strategy.');
      addXP(50);
      awardBadge('b7');
      fireConfetti();
      state.keyBuf = '';
    } else if (state.keyBuf.indexOf('behi') >= 0) {
      showToast('🇹🇳 Tunisian Secret! Behi — beautiful in Tunisian Arabic.');
      addXP(50);
      awardBadge('b9');
      fireConfetti();
      state.keyBuf = '';
    } else if (state.keyBuf.indexOf('help') >= 0) {
      showToast('💡 Hint: click the ❤️, triple-click 🐷, try Konami code, type "perfume" or "behi"', 5000);
      state.keyBuf = '';
    }
  }
});
