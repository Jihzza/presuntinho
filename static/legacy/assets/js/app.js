// App init — runs on DOMContentLoaded (or immediately if already loaded).
// All modules (state, easter-eggs, quizzes) are already in global scope
// because their <script> tags come before this one in index.html.

(function () {
  function boot() {
    renderBadges();
    renderQuiz('q1', 'q1');
    renderQuiz('q2', 'q2');
    renderQuiz('q3', 'q3');
    renderQuiz('q4', 'q4');
    renderQuiz('ptq', 'pt-quiz');
    initBurger();
    renderSecrets();

    // Show welcome toast on first visit only
    if (state.xp === 0 && Object.keys(state.badges).length === 0) {
      setTimeout(function () {
        showToast('🐷 Welcome! Find the easter eggs 🥚', 4000);
      }, 800);
    }

    updateProgress();
    updateQuizProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
