<script lang="ts">
	// V10.2 — Presuntinho, a mascote oficial 🐷 (SVG desenhado, não emoji).
	//
	// Construído segundo as regras que fazem o Duo funcionar:
	//   * cabeça:corpo ≈ 55:45, pés em "pílulas" destacadas (animáveis sem rig)
	//   * olhos ≈ 26% da largura da cabeça, na METADE INFERIOR, afastados
	//     exatamente um olho de distância, pupila ~50% com brilho no canto
	//   * focinho-herói: ~47% da largura da cara, terço inferior, narinas
	//     verticais; bochechas rosadas sob os olhos
	//   * paleta: 2 tons de rosa + rosa-escuro de acento + cinza Eel #4b4b4b
	//     (nunca preto puro), tudo redondo, sem contornos duros
	//   * vida: respiração scaleY ~1.5% a cada 3.5s (origem em baixo),
	//     pestanejar ~4s com double-blink ocasional, orelhas com twitch raro
	//   * emoções por camadas (sobrancelhas + boca + adereços), corpo intacto
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
	<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" role="presentation">
		<!-- sombra no chão -->
		<ellipse class="pig-shadow" cx="60" cy="124" rx="27" ry="4.5" fill="rgba(0,0,0,0.16)" />

		<g class="pig-all">
			<!-- pés: pílulas destacadas (sem pernas — estilo Duo) -->
			<g class="pig-feet">
				<ellipse cx="47" cy="118" rx="9" ry="5.2" fill="#f472b6" />
				<ellipse cx="73" cy="118" rx="9" ry="5.2" fill="#f472b6" />
			</g>

			<!-- corpo -->
			<g class="pig-body">
				<ellipse cx="60" cy="93" rx="27" ry="23" fill="#f9a8d4" />
				<!-- barriga um tom mais claro -->
				<ellipse cx="60" cy="97" rx="18" ry="15" fill="#fbc9e2" />
				<!-- bracinhos: meias-luas coladas ao corpo -->
				<ellipse class="pig-arm pig-arm-left" cx="35" cy="90" rx="6.5" ry="10" fill="#f6a0ce" transform="rotate(14 35 90)" />
				<ellipse class="pig-arm pig-arm-right" cx="85" cy="90" rx="6.5" ry="10" fill="#f6a0ce" transform="rotate(-14 85 90)" />
			</g>

			<!-- cabeça (maior que o corpo — baby schema) -->
			<g class="pig-head">
				<!-- orelhas: folhas caídas para fora (amigável, não feral) -->
				<g class="pig-ear pig-ear-left">
					<path d="M31 24 Q18 8 14 20 Q13 30 30 36 Q33 28 31 24 Z" fill="#ec8fb8" />
					<path d="M28 26 Q20 15 18 22 Q18 28 28 32 Q29 28 28 26 Z" fill="#f472b6" />
				</g>
				<g class="pig-ear pig-ear-right">
					<path d="M89 24 Q102 8 106 20 Q107 30 90 36 Q87 28 89 24 Z" fill="#ec8fb8" />
					<path d="M92 26 Q100 15 102 22 Q102 28 92 32 Q91 28 92 26 Z" fill="#f472b6" />
				</g>

				<!-- cara larga nos lados -->
				<ellipse cx="60" cy="48" rx="37" ry="33" fill="#f9a8d4" />
				<!-- brilho suave -->
				<ellipse cx="43" cy="32" rx="13" ry="8" fill="rgba(255,255,255,0.32)" transform="rotate(-22 43 32)" />

				<!-- bochechas: por baixo e por fora dos olhos -->
				<ellipse class="pig-cheek" cx="30" cy="60" rx="6.5" ry="4.2" fill="#f472b6" opacity="0.5" />
				<ellipse class="pig-cheek" cx="90" cy="60" rx="6.5" ry="4.2" fill="#f472b6" opacity="0.5" />

				<!-- sobrancelhas por emoção (pontas interiores para CIMA = tristeza/preocupação) -->
				{#if emotion === 'sad'}
					<path d="M36 39 Q42 35 49 40" stroke="#4b4b4b" stroke-width="2.6" fill="none" stroke-linecap="round" />
					<path d="M84 39 Q78 35 71 40" stroke="#4b4b4b" stroke-width="2.6" fill="none" stroke-linecap="round" />
				{:else if emotion === 'worried'}
					<path d="M37 37 Q43 34 49 38" stroke="#4b4b4b" stroke-width="2.4" fill="none" stroke-linecap="round" />
					<path d="M83 37 Q77 34 71 38" stroke="#4b4b4b" stroke-width="2.4" fill="none" stroke-linecap="round" />
				{/if}

				<!-- olhos: metade inferior da cabeça, um olho de distância entre eles -->
				{#if emotion === 'euphoric'}
					<!-- fechados de alegria (^ ^) -->
					<path d="M38 50 Q45 42 52 50" stroke="#4b4b4b" stroke-width="4" fill="none" stroke-linecap="round" />
					<path d="M68 50 Q75 42 82 50" stroke="#4b4b4b" stroke-width="4" fill="none" stroke-linecap="round" />
					<g class="pig-sparkles">
						<path d="M16 18 l2.4 5 5.2 .8 -3.8 3.7 .9 5.2 -4.7 -2.5 -4.6 2.5 .9 -5.2 -3.8 -3.7 5.2 -.8 Z" fill="#fcd34d" />
						<path d="M100 12 l1.9 4 4.2 .6 -3 3 .7 4.2 -3.8 -2 -3.8 2 .7 -4.2 -3 -3 4.2 -.6 Z" fill="#fcd34d" />
						<circle cx="24" cy="44" r="2" fill="#fcd34d" />
						<circle cx="98" cy="40" r="2" fill="#fcd34d" />
					</g>
				{:else}
					<g class="pig-eyes">
						<!-- branco → pupila ~50% → brilho canto superior -->
						<ellipse cx="45" cy="50" rx="9" ry="10" fill="#fff" />
						<ellipse cx="75" cy="50" rx="9" ry="10" fill="#fff" />
						{#if emotion === 'worried'}
							<ellipse cx="45" cy="51" rx="5.6" ry="6.4" fill="#4b4b4b" />
							<ellipse cx="75" cy="51" rx="5.6" ry="6.4" fill="#4b4b4b" />
							<circle cx="43" cy="48" r="2.1" fill="#fff" />
							<circle cx="73" cy="48" r="2.1" fill="#fff" />
						{:else if emotion === 'sad'}
							<ellipse cx="45" cy="52" rx="4.6" ry="5.4" fill="#4b4b4b" />
							<ellipse cx="75" cy="52" rx="4.6" ry="5.4" fill="#4b4b4b" />
							<circle cx="43.4" cy="49.8" r="1.7" fill="#fff" />
							<circle cx="73.4" cy="49.8" r="1.7" fill="#fff" />
						{:else}
							<ellipse cx="45" cy="50" rx="4.8" ry="5.6" fill="#4b4b4b" />
							<ellipse cx="75" cy="50" rx="4.8" ry="5.6" fill="#4b4b4b" />
							<circle cx="43.3" cy="47.6" r="1.8" fill="#fff" />
							<circle cx="73.3" cy="47.6" r="1.8" fill="#fff" />
						{/if}
					</g>
				{/if}

				<!-- adereços emocionais -->
				{#if emotion === 'sad'}
					<path class="pig-tear" d="M34 56 q-4.5 7.5 0 10.5 q4.5 -3 0 -10.5 Z" fill="#7dd3fc" />
				{:else if emotion === 'worried'}
					<path class="pig-sweat" d="M97 30 q-5 8.5 0 12 q5 -3.5 0 -12 Z" fill="#93c5fd" />
				{/if}

				<!-- focinho-herói: ~47% da cara, terço inferior, narinas VERTICAIS -->
				<g class="pig-snout">
					<ellipse cx="60" cy="64" rx="17.5" ry="12" fill="#f472b6" />
					<ellipse cx="60" cy="62.4" rx="15.5" ry="9.6" fill="#f78fc5" />
					<ellipse cx="53.5" cy="64" rx="2.6" ry="4.6" fill="#9d2f63" />
					<ellipse cx="66.5" cy="64" rx="2.6" ry="4.6" fill="#9d2f63" />
				</g>

				<!-- boca por emoção (assimétrica de propósito — lê-se viva) -->
				{#if emotion === 'euphoric'}
					<path d="M48 79 Q59 91 72 79 Q66 84 48 79 Z" fill="#9d2f63" />
					<path d="M54 82 Q60 87 66 82 Q60 89 54 82 Z" fill="#f78fc5" />
				{:else if emotion === 'happy'}
					<path d="M51 79 Q61 86 71 78" stroke="#4b4b4b" stroke-width="3" fill="none" stroke-linecap="round" />
				{:else if emotion === 'sad'}
					<path d="M52 83 Q61 77 69 82" stroke="#4b4b4b" stroke-width="3" fill="none" stroke-linecap="round" />
				{:else if emotion === 'worried'}
					<path d="M53 81 Q60 79 68 82" stroke="#4b4b4b" stroke-width="2.8" fill="none" stroke-linecap="round" />
				{:else}
					<path d="M53 80 Q61 82 68 80" stroke="#4b4b4b" stroke-width="2.8" fill="none" stroke-linecap="round" />
				{/if}
			</g>
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

	/* respiração: 1.5% a cada 3.5s, comprimindo contra o chão */
	.pig:not(.still) .pig-body,
	.pig:not(.still) .pig-head {
		animation: pig-breathe 3.5s ease-in-out infinite;
		transform-origin: 60px 116px;
	}
	/* movimento secundário: a cabeça segue com um pequeno atraso */
	.pig:not(.still) .pig-head {
		animation-delay: 0.15s;
	}

	/* orelhas: twitch raro (~1 vez por ciclo de 7s) */
	.pig:not(.still) .pig-ear-left {
		animation: pig-ear 7s ease-in-out infinite;
		transform-origin: 30px 30px;
	}
	.pig:not(.still) .pig-ear-right {
		animation: pig-ear 7s ease-in-out infinite reverse;
		transform-origin: 90px 30px;
	}

	/* pestanejar: ciclo ~4.4s com double-blink ocasional */
	.pig:not(.still) .pig-eyes {
		animation: pig-blink 4.4s infinite;
		transform-origin: 60px 50px;
	}

	/* emoções */
	.pig-euphoric:not(.still) .pig-all {
		animation: pig-hop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
		transform-origin: 60px 122px;
	}
	.pig-euphoric .pig-sparkles {
		animation: pig-sparkle 1.2s ease-in-out infinite;
	}
	.pig-worried:not(.still) .pig-all {
		animation: pig-tremble 1.5s ease-in-out infinite;
		transform-origin: 60px 122px;
	}
	.pig-worried .pig-sweat {
		animation: pig-drip 1.9s ease-in infinite;
	}
	.pig-sad .pig-all {
		transform: translateY(3px) rotate(-3deg);
		transform-origin: 60px 122px;
	}
	.pig-sad:not(.still) .pig-tear {
		animation: pig-drip 2.4s ease-in infinite;
	}

	@keyframes pig-breathe {
		0%, 100% { transform: scaleY(1); }
		50% { transform: scaleY(1.015); }
	}
	@keyframes pig-ear {
		0%, 88%, 100% { transform: rotate(0deg); }
		91% { transform: rotate(-8deg); }
		95% { transform: rotate(4deg); }
	}
	@keyframes pig-blink {
		0%, 88%, 92.5%, 100% { transform: scaleY(1); }
		90% { transform: scaleY(0.06); }
		/* double-blink ocasional dentro do mesmo ciclo */
		94.5% { transform: scaleY(0.06); }
		96.5% { transform: scaleY(1); }
	}
	@keyframes pig-hop {
		/* squash → stretch a subir → squash a aterrar (volume preservado) */
		0%, 100% { transform: translateY(0) scale(1, 1); }
		12% { transform: translateY(0) scale(1.08, 0.92); }
		42% { transform: translateY(-9px) scale(0.95, 1.06); }
		70% { transform: translateY(0) scale(1.06, 0.94); }
		85% { transform: translateY(0) scale(0.99, 1.01); }
	}
	@keyframes pig-tremble {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-1.4px) rotate(-0.6deg); }
		75% { transform: translateX(1.4px) rotate(0.6deg); }
	}
	@keyframes pig-drip {
		0% { opacity: 0; transform: translateY(-2px); }
		30% { opacity: 1; }
		100% { opacity: 0; transform: translateY(8px); }
	}
	@keyframes pig-sparkle {
		0%, 100% { opacity: 0.35; transform: scale(0.9); }
		50% { opacity: 1; transform: scale(1.12); }
	}
</style>
