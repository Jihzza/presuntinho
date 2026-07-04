<script lang="ts">
	// V10.2 — Presuntinho, a mascote oficial 🐷 (SVG desenhado, não emoji).
	// Como o Duo do Duolingo: um personagem próprio com estados emocionais
	// que reagem ao dia da Fatma (emotion.ts) e micro-animações de vida
	// (respirar, pestanejar, orelhas). Decorativa por defeito (aria-hidden);
	// quem precisar de semântica embrulha-a num elemento com label.
	import type { MascotEmotion } from '$lib/gamification/emotion';

	interface Props {
		emotion?: MascotEmotion;
		/** Largura/altura em px. */
		size?: number;
		/** Desliga as animações de vida (para contextos muito pequenos). */
		still?: boolean;
	}
	let { emotion = 'happy', size = 64, still = false }: Props = $props();
</script>

<span
	class="pig pig-{emotion}"
	class:still
	style="width: {size}px; height: {size}px;"
	aria-hidden="true"
>
	<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="presentation">
		<!-- sombra no chão -->
		<ellipse class="pig-shadow" cx="60" cy="112" rx="30" ry="5" fill="rgba(0,0,0,0.18)" />

		<g class="pig-body">
			<!-- orelhas -->
			<g class="pig-ear pig-ear-left">
				<path d="M28 34 Q22 12 42 18 Q38 30 34 38 Z" fill="#ec8fb8" />
				<path d="M30 31 Q27 19 39 22 Q36 29 33 34 Z" fill="#f7b8d4" />
			</g>
			<g class="pig-ear pig-ear-right">
				<path d="M92 34 Q98 12 78 18 Q82 30 86 38 Z" fill="#ec8fb8" />
				<path d="M90 31 Q93 19 81 22 Q84 29 87 34 Z" fill="#f7b8d4" />
			</g>

			<!-- cabeça -->
			<circle cx="60" cy="62" r="42" fill="#f9a8d4" />
			<circle cx="60" cy="62" r="42" fill="none" stroke="#ec8fb8" stroke-width="2.5" />
			<!-- brilho -->
			<ellipse cx="44" cy="44" rx="14" ry="9" fill="rgba(255,255,255,0.35)" transform="rotate(-24 44 44)" />

			<!-- bochechas -->
			<ellipse class="pig-cheek" cx="30" cy="72" rx="7.5" ry="5" fill="#f472b6" opacity="0.55" />
			<ellipse class="pig-cheek" cx="90" cy="72" rx="7.5" ry="5" fill="#f472b6" opacity="0.55" />

			<!-- olhos por emoção -->
			{#if emotion === 'euphoric'}
				<!-- olhos fechados de alegria (^ ^) -->
				<path d="M36 56 Q42 48 48 56" stroke="#3b2033" stroke-width="4" fill="none" stroke-linecap="round" />
				<path d="M72 56 Q78 48 84 56" stroke="#3b2033" stroke-width="4" fill="none" stroke-linecap="round" />
				<!-- estrelinhas -->
				<g class="pig-sparkles">
					<path d="M20 26 l2.2 4.6 4.8 .7 -3.5 3.4 .8 4.8 -4.3 -2.3 -4.3 2.3 .8 -4.8 -3.5 -3.4 4.8 -.7 Z" fill="#fcd34d" />
					<path d="M96 20 l1.8 3.7 3.9 .6 -2.8 2.7 .7 3.9 -3.6 -1.9 -3.5 1.9 .7 -3.9 -2.9 -2.7 4 -.6 Z" fill="#fcd34d" />
				</g>
			{:else if emotion === 'sad'}
				<!-- olhos caídos + lágrima -->
				<g class="pig-eyes">
					<circle cx="42" cy="58" r="5.5" fill="#3b2033" />
					<circle cx="78" cy="58" r="5.5" fill="#3b2033" />
					<circle cx="43.6" cy="56.4" r="1.8" fill="#fff" />
					<circle cx="79.6" cy="56.4" r="1.8" fill="#fff" />
				</g>
				<path d="M34 48 Q41 52 48 51" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
				<path d="M86 48 Q79 52 72 51" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
				<path class="pig-tear" d="M33 62 q-4.5 7 0 10 q4.5 -3 0 -10 Z" fill="#7dd3fc" />
			{:else if emotion === 'worried'}
				<!-- olhos grandes + gota de suor -->
				<g class="pig-eyes">
					<circle cx="42" cy="57" r="7" fill="#3b2033" />
					<circle cx="78" cy="57" r="7" fill="#3b2033" />
					<circle cx="44.4" cy="54.6" r="2.4" fill="#fff" />
					<circle cx="80.4" cy="54.6" r="2.4" fill="#fff" />
				</g>
				<path d="M35 46 Q42 43 48 47" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
				<path d="M85 46 Q78 43 72 47" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
				<path class="pig-sweat" d="M97 40 q-5 8 0 11.5 q5 -3.5 0 -11.5 Z" fill="#93c5fd" />
			{:else}
				<!-- happy / neutral: olhos redondos com brilho (+ pestanejar) -->
				<g class="pig-eyes">
					<circle cx="42" cy="57" r="5.5" fill="#3b2033" />
					<circle cx="78" cy="57" r="5.5" fill="#3b2033" />
					<circle cx="43.6" cy="55.4" r="1.8" fill="#fff" />
					<circle cx="79.6" cy="55.4" r="1.8" fill="#fff" />
				</g>
			{/if}

			<!-- focinho -->
			<g class="pig-snout">
				<ellipse cx="60" cy="72" rx="16" ry="11.5" fill="#f472b6" />
				<ellipse cx="60" cy="72" rx="16" ry="11.5" fill="none" stroke="#db5f9b" stroke-width="2" />
				<ellipse cx="54" cy="72" rx="2.6" ry="4" fill="#9d2f63" />
				<ellipse cx="66" cy="72" rx="2.6" ry="4" fill="#9d2f63" />
			</g>

			<!-- boca por emoção -->
			{#if emotion === 'euphoric'}
				<path d="M48 88 Q60 100 72 88" stroke="#3b2033" stroke-width="3.5" fill="none" stroke-linecap="round" />
			{:else if emotion === 'happy'}
				<path d="M50 88 Q60 95 70 88" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
			{:else if emotion === 'sad'}
				<path d="M50 93 Q60 86 70 93" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
			{:else if emotion === 'worried'}
				<path d="M52 90 Q60 88 68 91" stroke="#3b2033" stroke-width="3" fill="none" stroke-linecap="round" />
			{:else}
				<path d="M52 90 L68 90" stroke="#3b2033" stroke-width="3" stroke-linecap="round" />
			{/if}
		</g>
	</svg>
</span>

<style>
	.pig {
		display: inline-block;
		line-height: 0;
	}

	.pig svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}

	/* respiração/idle — sobe e desce suavemente */
	.pig:not(.still) .pig-body {
		animation: pig-breathe 3.4s ease-in-out infinite;
		transform-origin: 60px 100px;
	}

	/* orelhas com vida */
	.pig:not(.still) .pig-ear-left {
		animation: pig-ear 5.2s ease-in-out infinite;
		transform-origin: 34px 34px;
	}
	.pig:not(.still) .pig-ear-right {
		animation: pig-ear 5.2s ease-in-out infinite reverse;
		transform-origin: 86px 34px;
	}

	/* pestanejar (só nos estados de olhos abertos) */
	.pig:not(.still) .pig-eyes {
		animation: pig-blink 4.6s infinite;
		transform-origin: 60px 57px;
	}

	/* emoções */
	.pig-euphoric:not(.still) .pig-body {
		animation: pig-hop 0.9s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
	}
	.pig-euphoric .pig-sparkles {
		animation: pig-sparkle 1.2s ease-in-out infinite;
	}
	.pig-worried:not(.still) .pig-body {
		animation: pig-tremble 1.4s ease-in-out infinite;
	}
	.pig-worried .pig-sweat {
		animation: pig-drip 1.8s ease-in infinite;
	}
	.pig-sad .pig-body {
		transform: translateY(3px);
	}
	.pig-sad:not(.still) .pig-tear {
		animation: pig-drip 2.4s ease-in infinite;
	}

	@keyframes pig-breathe {
		0%, 100% { transform: translateY(0) scale(1); }
		50% { transform: translateY(-2px) scale(1.015); }
	}
	@keyframes pig-ear {
		0%, 86%, 100% { transform: rotate(0deg); }
		90% { transform: rotate(-7deg); }
		95% { transform: rotate(4deg); }
	}
	@keyframes pig-blink {
		0%, 91%, 96%, 100% { transform: scaleY(1); }
		93.5% { transform: scaleY(0.08); }
	}
	@keyframes pig-hop {
		0%, 100% { transform: translateY(0); }
		40% { transform: translateY(-8px) rotate(-2deg); }
		60% { transform: translateY(-8px) rotate(2deg); }
	}
	@keyframes pig-tremble {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-1.4px) rotate(-0.7deg); }
		75% { transform: translateX(1.4px) rotate(0.7deg); }
	}
	@keyframes pig-drip {
		0% { opacity: 0; transform: translateY(-2px); }
		30% { opacity: 1; }
		100% { opacity: 0; transform: translateY(7px); }
	}
	@keyframes pig-sparkle {
		0%, 100% { opacity: 0.4; transform: scale(0.9); }
		50% { opacity: 1; transform: scale(1.12); }
	}
</style>
