// ─────────────────────────────────────────────────────────────────────────────
// Presuntinho V10 — single source of truth for the badge catalog.
//
// V4–V9 shipped a BadgeGrid whose labels had drifted from the actual award
// triggers (e.g. b8 displayed "Coração" but is awarded by the Konami code).
// This catalog restores the V3 contract semantics (static/legacy/assets/js/
// state.js BADGES + easter-eggs.js award sites) and adds the V10 tier/family
// metadata for the bronze→prata→ouro presentation.
//
// Award triggers (all live, verified):
//   b1  first XP-earning action        (GamificationLayer)
//   b2  first lesson completed          (escola/progress.ts completeLessonOnce)
//   b3  first perfect quiz              (QuizRunner)
//   b4  10+ quiz answers total          (QuizRunner)
//   b5  first caderno note              (escola/caderno)
//   b6  8+ pages explored               (GamificationLayer)
//   b7  keyword 'perfume'               (easterEggs)
//   b8  Konami code                     (easterEggs)
//   b9  keyword 'behi'                  (easterEggs)
//   b10 heart click #1                  (easterEggs)
//   b11 perfect PT quiz                 (QuizRunner)
//   b12 heart tier 1000                 (easterEggs, via config)
//   b13 heart tier 100                  (easterEggs, via config)
//   b14 Secret Room / keyword 'fatma'   (easterEggs)
//   b15 footer ×5                       (easterEggs)
//   b16 habit streak 7d                 (habitos.ts)
//   b17 habit streak 30d                (habitos.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeTier = 'bronze' | 'prata' | 'ouro';
export type BadgeFamily = 'percurso' | 'quiz' | 'coracao' | 'segredos' | 'streak';

export interface BadgeDef {
	id: string;
	icon: string;
	family: BadgeFamily;
	tier?: BadgeTier;
}

export const BADGE_CATALOG: readonly BadgeDef[] = Object.freeze([
	{ id: 'b1', icon: '🎯', family: 'percurso' },
	{ id: 'b2', icon: '📚', family: 'percurso' },
	{ id: 'b5', icon: '✍️', family: 'percurso' },
	{ id: 'b6', icon: '🧭', family: 'percurso' },
	{ id: 'b3', icon: '✅', family: 'quiz', tier: 'bronze' },
	{ id: 'b4', icon: '🏆', family: 'quiz', tier: 'prata' },
	{ id: 'b11', icon: '🇵🇹', family: 'quiz', tier: 'ouro' },
	{ id: 'b16', icon: '🔥', family: 'streak', tier: 'bronze' },
	{ id: 'b17', icon: '💎', family: 'streak', tier: 'ouro' },
	{ id: 'b10', icon: '❤️', family: 'coracao', tier: 'bronze' },
	{ id: 'b13', icon: '💯', family: 'coracao', tier: 'prata' },
	{ id: 'b12', icon: '🌟', family: 'coracao', tier: 'ouro' },
	{ id: 'b7', icon: '🌸', family: 'segredos' },
	{ id: 'b8', icon: '🎮', family: 'segredos' },
	{ id: 'b9', icon: '🇹🇳', family: 'segredos' },
	{ id: 'b14', icon: '🧴', family: 'segredos' },
	{ id: 'b15', icon: '👣', family: 'segredos' }
]);

export function badgeDefById(id: string): BadgeDef | undefined {
	return BADGE_CATALOG.find((b) => b.id === id);
}

/** pt-PT fallbacks — the UI resolves components.badge.catalog.<id>.name/.description first. */
export const BADGE_PT_NAMES: Record<string, string> = {
	b1: 'Primeiros Passos',
	b2: 'Leitora',
	b3: 'Quiz Perfeito',
	b4: 'Quizzmaster',
	b5: 'Escritora',
	b6: 'Exploradora',
	b7: 'Descoberta do Perfume',
	b8: 'Mestre Konami',
	b9: 'Segredo Tunisino',
	b10: 'Coração Apaixonado',
	b11: 'Lusófona',
	b12: 'Lenda do Coração',
	b13: 'Centurião do Coração',
	b14: 'Guardiã do Segredo',
	b15: 'Detetive do Rodapé',
	b16: 'Em Chamas',
	b17: 'Imparável'
};

export const BADGE_PT_DESCRIPTIONS: Record<string, string> = {
	b1: 'Ganhaste os teus primeiros XP',
	b2: 'Completaste a primeira lição',
	b3: 'Um quiz com nota perfeita',
	b4: 'Respondeste a 10 perguntas de quizzes',
	b5: 'Escreveste a primeira nota no caderno',
	b6: 'Exploraste 8 cantos da app',
	b7: 'Escreveste a palavra secreta "perfume"',
	b8: 'Fizeste o código Konami',
	b9: 'Escreveste a palavra tunisina "behi"',
	b10: 'O primeiro clique no coração',
	b11: 'Quiz de Português com nota perfeita',
	b12: '1000 cliques no coração — lenda absoluta',
	b13: '100 cliques no coração',
	b14: 'Descobriste a Sala Secreta',
	b15: 'Cinco cliques no rodapé — nada te escapa',
	b16: 'Streak de hábitos de 7 dias',
	b17: 'Streak de hábitos de 30 dias'
};

export const TIER_PT_LABELS: Record<BadgeTier, string> = {
	bronze: 'Bronze',
	prata: 'Prata',
	ouro: 'Ouro'
};
