<script lang="ts">
	// V10.3 — Presuntinho, a mascote oficial 🐷 (SVG desenhado, não emoji).
	//
	// Silhueta ÚNICA como o Duo ("um cilindro com asas"): o Presuntinho é um
	// ovo rosa com patinhas-pílula destacadas — lê-se como forma preta a 32px.
	// Regras aplicadas do estudo de design:
	//   * olhos ≈ 26% da largura da cara, metade inferior, um olho de
	//     distância entre eles, pupila ~50% com brilho no canto superior
	//   * focinho-herói ~46% da cara, terço inferior, narinas verticais
	//   * orelhas-folha caídas para fora (amigável); bochechas sob os olhos
	//   * paleta: 2 tons de rosa + acento escuro + cinza Eel #4b4b4b
	//   * vida: respiração 3.5s (origem no chão), pestanejar ~4.4s com
	//     double-blink, twitch de orelhas raro, squash & stretch nos saltos
	//   * emoções por camadas: sobrancelhas + boca + adereços, corpo intacto
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
		<ellipse class="pig-shadow" cx="60" cy="123" rx="26" ry="4.5" fill="rgba(0,0,0,0.16)" />

		<g class="pig-all">
			<!-- patinhas-pílula destacadas (sem pernas) -->
			<g class="pig-feet">
				<ellipse cx="46" cy="116" rx="9.5" ry="5.4" fill="#ec6ba9" />
				<ellipse cx="74" cy="116" rx="9.5" ry="5.4" fill="#ec6ba9" />
			</g>

			<!-- orelhas-folha caídas para fora -->
			<g class="pig-ear pig-ear-left">
				<path d="M35 26 Q20 6 14 19 Q12 31 32 39 Q35 31 35 26 Z" fill="#ec6ba9" />
				<path d="M32 28 Q23 15 20 22 Q19 29 30 34 Q31 30 32 28 Z" fill="#f9a8d4" />
			</g>
			<g class="pig-ear pig-ear-right">
				<path d="M85 26 Q100 6 106 19 Q108 31 88 39 Q85 31 85 26 Z" fill="#ec6ba9" />
				<path d="M88 28 Q97 15 100 22 Q101 29 90 34 Q89 30 88 28 Z" fill="#f9a8d4" />
			</g>

			<!-- corpo-ovo único (cabeça + corpo numa só forma) -->
			<path
				d="M60 14
				   C 36 14, 22 38, 22 70
				   C 22 98, 38 113, 60 113
				   C 82 113, 98 98, 98 70
				   C 98 38, 84 14, 60 14 Z"
				fill="#f9a8d4"
			/>
			<!-- barriga um tom mais claro -->
			<ellipse cx="60" cy="92" rx="21" ry="17" fill="#fcd0e6" />
			<!-- brilho suave -->
			<ellipse cx="42" cy="30" rx="12" ry="7" fill="rgba(255,255,255,0.34)" transform="rotate(-24 42 30)" />

			<!-- bracinhos: meias-luas coladas ao corpo -->
			<ellipse class="pig-arm" cx="27" cy="84" rx="6" ry="11" fill="#f48fc5" transform="rotate(12 27 84)" />
			<ellipse class="pig-arm" cx="93" cy="84" rx="6" ry="11" fill="#f48fc5" transform="rotate(-12 93 84)" />

			<!-- bochechas sob os olhos -->
			<ellipse class="pig-cheek" cx="31" cy="60" rx="6.5" ry="4.2" fill="#f472b6" opacity="0.55" />
			<ellipse class="pig-cheek" cx="89" cy="60" rx="6.5" ry="4.2" fill="#f472b6" opacity="0.55" />

			<!-- sobrancelhas (pontas interiores para CIMA = tristeza/preocupação) -->
			{#if emotion === 'sad'}
				<path d="M36 40 Q42 36 49 41" stroke="#4b4b4b" stroke-width="2.6" fill="none" stroke-linecap="round" />
				<path d="M84 40 Q78 36 71 41" stroke="#4b4b4b" stroke-width="2.6" fill="none" stroke-linecap="round" />
			{:else if emotion === 'worried'}
				<path d="M37 38 Q43 35 49 39" stroke="#4b4b4b" stroke-width="2.4" fill="none" stroke-linecap="round" />
				<path d="M83 38 Q77 35 71 39" stroke="#4b4b4b" stroke-width="2.4" fill="none" stroke-linecap="round" />
			{/if}

			<!-- olhos -->
			{#if emotion === 'euphoric'}
				<path d="M38 51 Q45 43 52 51" stroke="#4b4b4b" stroke-width="4" fill="none" stroke-linecap="round" />
				<path d="M68 51 Q75 43 82 51" stroke="#4b4b4b" stroke-width="4" fill="none" stroke-linecap="round" />
				<g class="pig-sparkles">
					<path d="M14 20 l2.4 5 5.2 .8 -3.8 3.7 .9 5.2 -4.7 -2.5 -4.6 2.5 .9 -5.2 -3.8 -3.7 5.2 -.8 Z" fill="#fcd34d" />
					<path d="M102 14 l1.9 4 4.2 .6 -3 3 .7 4.2 -3.8 -2 -3.8 2 .7 -4.2 -3 -3 4.2 -.6 Z" fill="#fcd34d" />
					<circle cx="22" cy="46" r="2" fill="#fcd34d" />
					<circle cx="100" cy="42" r="2" fill="#fcd34d" />
				</g>
			{:else}
				<g class="pig-eyes">
					<ellipse cx="45" cy="51" rx="9" ry="10" fill="#fff" />
					<ellipse cx="75" cy="51" rx="9" ry="10" fill="#fff" />
					{#if emotion === 'worried'}
						<ellipse cx="45" cy="52" rx="5.6" ry="6.4" fill="#4b4b4b" />
						<ellipse cx="75" cy="52" rx="5.6" ry="6.4" fill="#4b4b4b" />
						<circle cx="43" cy="49" r="2.1" fill="#fff" />
						<circle cx="73" cy="49" r="2.1" fill="#fff" />
					{:else if emotion === 'sad'}
						<ellipse cx="45" cy="53" rx="4.6" ry="5.4" fill="#4b4b4b" />
						<ellipse cx="75" cy="53" rx="4.6" ry="5.4" fill="#4b4b4b" />
						<circle cx="43.4" cy="50.8" r="1.7" fill="#fff" />
						<circle cx="73.4" cy="50.8" r="1.7" fill="#fff" />
					{:else}
						<ellipse cx="45" cy="51" rx="4.8" ry="5.6" fill="#4b4b4b" />
						<ellipse cx="75" cy="51" rx="4.8" ry="5.6" fill="#4b4b4b" />
						<circle cx="43.3" cy="48.6" r="1.8" fill="#fff" />
						<circle cx="73.3" cy="48.6" r="1.8" fill="#fff" />
					{/if}
				</g>
			{/if}

			<!-- adereços emocionais -->
			{#if emotion === 'sad'}
				<path class="pig-tear" d="M34 57 q-4.5 7.5 0 10.5 q4.5 -3 0 -10.5 Z" fill="#7dd3fc" />
			{:else if emotion === 'worried'}
				<path class="pig-sweat" d="M98 32 q-5 8.5 0 12 q5 -3.5 0 -12 Z" fill="#93c5fd" />
			{/if}

			<!-- focinho-herói -->
			<g class="pig-snout">
				<ellipse cx="60" cy="66" rx="16.5" ry="11.5" fill="#ec6ba9" />
				<ellipse cx="60" cy="64.6" rx="14.5" ry="9.2" fill="#f78fc5" />
				<ellipse cx="54" cy="66" rx="2.5" ry="4.4" fill="#9d2f63" />
				<ellipse cx="66" cy="66" rx="2.5" ry="4.4" fill="#9d2f63" />
			</g>

			<!-- boca (assimétrica de propósito) -->
			{#if emotion === 'euphoric'}
				<path d="M48 80 Q59 92 72 80 Q66 85 48 80 Z" fill="#9d2f63" />
				<path d="M54 83 Q60 88 66 83 Q60 90 54 83 Z" fill="#f78fc5" />
			{:else if emotion === 'happy'}
				<path d="M51 80 Q61 87 71 79" stroke="#4b4b4b" stroke-width="3" fill="none" stroke-linecap="round" />
			{:else if emotion === 'sad'}
				<path d="M52 84 Q61 78 69 83" stroke="#4b4b4b" stroke-width="3" fill="none" stroke-linecap="round" />
			{:else if emotion === 'worried'}
				<path d="M53 82 Q60 80 68 83" stroke="#4b4b4b" stroke-width="2.8" fill="none" stroke-linecap="round" />
			{:else}
				<path d="M53 81 Q61 83 68 81" stroke="#4b4b4b" stroke-width="2.8" fill="none" stroke-linecap="round" />
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

	/* respiração: ~1.5% a cada 3.5s, comprimindo contra o chão */
	.pig:not(.still) .pig-all {
		animation: pig-breathe 3.5s ease-in-out infinite;
		transform-origin: 60px 116px;
	}

	/* orelhas: twitch raro */
	.pig:not(.still) .pig-ear-left {
		animation: pig-ear 7s ease-in-out infinite;
		transform-origin: 32px 32px;
	}
	.pig:not(.still) .pig-ear-right {
		animation: pig-ear 7s ease-in-out infinite reverse;
		transform-origin: 88px 32px;
	}

	/* pestanejar: ~4.4s com double-blink ocasional */
	.pig:not(.still) .pig-eyes {
		animation: pig-blink 4.4s infinite;
		transform-origin: 60px 51px;
	}

	/* emoções (sobrepõem a respiração no mesmo elemento — intencional) */
	.pig-euphoric:not(.still) .pig-all {
		animation: pig-hop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
	}
	.pig-euphoric .pig-sparkles {
		animation: pig-sparkle 1.2s ease-in-out infinite;
	}
	.pig-worried:not(.still) .pig-all {
		animation: pig-tremble 1.5s ease-in-out infinite;
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
		94.5% { transform: scaleY(0.06); }
		96.5% { transform: scaleY(1); }
	}
	@keyframes pig-hop {
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
