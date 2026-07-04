<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFETTI_EVENT, prefersReducedMotion, type ConfettiBurst } from './events';

  interface Props {
    count?: number;
  }
  let { count = 60 }: Props = $props();

  let layer = $state<HTMLDivElement | null>(null);

  const COLORS = ['#d4af37', '#b8945a', '#9b7ede', '#e8b4b8', '#4ecdc4', '#ff6b9d', '#c47891'];
  const HEART_SHAPES = ['♥', '✦', '●', '✧'];

  // ── V10.3 FEVER MODE ────────────────────────────────────────────────────
  // Quanto mais depressa clicas, MAIS acontece — o calor sobe por burst e
  // decai com o tempo. Níveis:
  //   T1 (calor <3): burst normal.
  //   T2 (3-7): peças maiores + brilho + flash do ecrã.
  //   T3 (≥7): FRENESIM — peças neon rápidas, flash forte, shake pesado e
  //            badge "×N 🔥" ao lado do coração.
  // Performance: teto de 260 peças VIVAS mas nunca deixa de rebentar — a
  // pool RECICLA as mais antigas, por isso martelar mantém o espetáculo
  // sem acumular DOM (era a acumulação que "partia" a animação).
  const MAX_LIVE_PIECES = 260;
  const PER_BURST_MAX = 90; // só rajadas do coração — celebrações grandes passam inteiras
  const HEAT_DECAY_MS = 700;
  // Teto do calor: sem ele, 30s de martelo "bancava" ~250 de calor e um
  // clique casual minutos depois ainda disparava T3 com um "×208" absurdo.
  const HEAT_MAX = 12;
  let heat = 0;
  let lastFireAt = 0;
  let lastFlashAt = 0;
  let lastComboPopAt = 0;
  let flashEl = $state<HTMLDivElement | null>(null);
  let comboEl = $state<HTMLDivElement | null>(null);
  let comboHideTimer: ReturnType<typeof setTimeout> | null = null;
  let anchorCache: { at: number; point: { x: number; y: number } | null } | null = null;

  /** Centro real do botão do coração — o burst nasce ALINHADO ao botão.
   *  Cache curto: martelar não deve forçar um layout por clique. */
  function heartAnchor(now: number): { x: number; y: number } | null {
    if (anchorCache && now - anchorCache.at < 400) return anchorCache.point;
    const el = document.querySelector('.heart-btn');
    let point: { x: number; y: number } | null = null;
    if (el instanceof HTMLElement) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    anchorCache = { at: now, point };
    return point;
  }

  /** Calor com o decaimento aplicado NA LEITURA — quem lê fora do fire()
   *  (ex.: o shake, que dispara antes do burst) vê sempre o valor fresco. */
  function currentHeat(now: number = performance.now()): number {
    return Math.max(0, heat - (now - lastFireAt) / HEAT_DECAY_MS);
  }

  function currentTier(now: number = performance.now()): 1 | 2 | 3 {
    const h = currentHeat(now);
    return h >= 7 ? 3 : h >= 3 ? 2 : 1;
  }

  function flash(tier: 2 | 3, now: number): void {
    if (!flashEl) return;
    // Fotossensibilidade (WCAG 2.3.1): no máximo ~3 flashes de ecrã por
    // segundo mesmo a martelar — o resto do feedback continua a escalar.
    if (now - lastFlashAt < 340) return;
    lastFlashAt = now;
    flashEl.classList.remove('flash-on', 'flash-hard');
    // reflow para reiniciar a animação (limitado a ≤3×/s pelo gate acima)
    void flashEl.offsetWidth;
    flashEl.classList.add(tier === 3 ? 'flash-hard' : 'flash-on');
  }

  function showCombo(anchor: { x: number; y: number } | null, now: number): void {
    if (!comboEl) return;
    const n = Math.round(heat);
    comboEl.textContent = currentTier(now) === 3 ? `×${n} 🔥` : `×${n}`;
    comboEl.style.left = `${Math.round((anchor?.x ?? window.innerWidth / 2) - 8)}px`;
    comboEl.style.top = `${Math.round((anchor?.y ?? 140) - 74)}px`;
    comboEl.style.setProperty('--combo-scale', String(Math.min(1.9, 1 + heat * 0.09)));
    comboEl.classList.add('combo-on');
    // O restart do pop custa um reflow — no máximo ~6/s; entre pops o texto
    // e a escala continuam a crescer (só writes, zero layout).
    if (now - lastComboPopAt >= 160) {
      lastComboPopAt = now;
      comboEl.classList.remove('combo-pop');
      void comboEl.offsetWidth;
      comboEl.classList.add('combo-pop');
    }
    if (comboHideTimer) clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(() => {
      comboEl?.classList.remove('combo-on', 'combo-pop');
      comboHideTimer = null;
    }, 900);
  }

  function fire(detail: number | ConfettiBurst) {
    if (!layer) return;
    if (prefersReducedMotion()) return;

    const now = performance.now();
    heat = Math.min(HEAT_MAX, currentHeat(now) + 1);
    lastFireAt = now;
    const tier = currentTier(now);

    const burst = typeof detail === 'number' ? null : detail;
    let total = Math.min(MAX_LIVE_PIECES, typeof detail === 'number' && detail > 0 ? detail : (burst?.count ?? count));
    const origin = burst?.origin ?? 'top';
    // Só as rajadas do coração levam teto por burst; as celebrações grandes
    // (marcos, níveis, baús) rebentam POR INTEIRO — a pool já protege o DOM.
    if (origin === 'heart') total = Math.min(total, PER_BURST_MAX);
    const intensity = Math.max(1, burst?.intensity ?? 1) + (tier - 1) * 1.4;
    const palette = burst?.palette ?? COLORS;

    // READ primeiro (âncora, com cache), WRITE depois — evita intercalar
    // layout forçado com mutações do DOM no caminho quente do clique.
    const anchor = origin === 'heart' ? heartAnchor(now) : null;

    // Pool com reciclagem: se estiver cheia, as peças mais ANTIGAS saem para
    // as novas entrarem — o burst nunca é engolido.
    const overflow = layer.childElementCount + total - MAX_LIVE_PIECES;
    for (let i = 0; i < overflow; i++) layer.firstElementChild?.remove();

    const frag = document.createDocumentFragment();

    for (let i = 0; i < total; i++) {
      const piece = document.createElement('div');
      piece.className = `confetti-piece confetti-${origin}${tier >= 2 ? ' piece-glow' : ''}${tier === 3 ? ' piece-frenzy' : ''}`;
      const color = palette[Math.floor(Math.random() * palette.length)];
      piece.style.setProperty('--c', color);
      piece.style.setProperty('--dx', `${(Math.random() - 0.5) * (origin === 'heart' ? 320 + intensity * 46 : 90)}px`);
      piece.style.setProperty('--spin', `${(Math.random() * 900 + 360) * (Math.random() > 0.5 ? 1 : -1)}deg`);
      // Mais calor = peças MAIORES (violência visual sem mais DOM).
      piece.style.setProperty('--scale', String((0.75 + Math.random() * Math.min(1.2, 0.42 + intensity * 0.13)) * (1 + (tier - 1) * 0.35)));
      if (origin === 'heart') {
        const x = (anchor?.x ?? window.innerWidth - 66) + (Math.random() - 0.5) * 26;
        const y = (anchor?.y ?? window.innerHeight - 148) + (Math.random() - 0.5) * 18;
        piece.style.left = `${Math.round(x)}px`;
        piece.style.top = `${Math.round(y)}px`;
      } else {
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.top = '-12px';
      }
      const speedUp = 1 - (tier - 1) * 0.18;
      piece.style.animationDuration = origin === 'heart'
        ? (Math.random() * 0.9 + 1.15) * speedUp + 's'
        : (Math.random() * 2 + 2) * speedUp + 's';
      piece.style.animationDelay = (Math.random() * 0.18) + 's';
      if (origin === 'heart' && Math.random() > 0.48) {
        piece.textContent = HEART_SHAPES[Math.floor(Math.random() * HEART_SHAPES.length)];
      }
      frag.appendChild(piece);
      setTimeout(() => { piece.remove(); }, 4600);
    }
    layer.appendChild(frag);

    // Reações extra por nível de calor.
    if (tier >= 2) flash(tier as 2 | 3, now);
    if (origin === 'heart' && heat >= 3) showCombo(anchor, now);
  }

  onMount(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number | ConfettiBurst>;
      fire(ce.detail ?? count);
    };
    let shakeTimer: ReturnType<typeof setTimeout> | null = null;
    let shakeHard = false;
    const shake = () => {
      if (prefersReducedMotion()) return;
      const wantHard = currentTier() === 3;
      // Sem restart em rajada (o cancel+restart por clique era o que partia
      // a animação) — MAS se o calor subir a T3 a meio, o shake em curso é
      // PROMOVIDO a pesado: mais violência, zero reflow extra.
      const targets = [
        document.getElementById('main-content'),
        document.querySelector('header.nav'),
        document.querySelector('nav.bottom-nav')
      ].filter((el): el is HTMLElement => el instanceof HTMLElement);
      if (shakeTimer) {
        if (wantHard && !shakeHard) {
          shakeHard = true;
          for (const el of targets) el.classList.add('presuntinho-shake--hard');
        }
        return;
      }
      shakeHard = wantHard;
      for (const el of targets) {
        el.classList.add('presuntinho-shake');
        if (wantHard) el.classList.add('presuntinho-shake--hard');
      }
      shakeTimer = setTimeout(() => {
        shakeTimer = null;
        for (const el of targets) el.classList.remove('presuntinho-shake', 'presuntinho-shake--hard');
      }, 440);
    };
    window.addEventListener(CONFETTI_EVENT, handler);
    window.addEventListener('presuntinho:screen-shake', shake);
    return () => {
      window.removeEventListener(CONFETTI_EVENT, handler);
      window.removeEventListener('presuntinho:screen-shake', shake);
      if (shakeTimer) clearTimeout(shakeTimer);
      if (comboHideTimer) clearTimeout(comboHideTimer);
    };
  });
</script>

<div class="confetti-layer" bind:this={layer} aria-hidden="true"></div>
<div class="fever-flash" bind:this={flashEl} aria-hidden="true"></div>
<div class="fever-combo" bind:this={comboEl} aria-hidden="true"></div>

<style>
  .confetti-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9999;
    overflow: hidden;
    contain: strict;
  }
  :global(.confetti-piece) {
    position: absolute;
    top: -10px;
    width: 10px;
    height: 16px;
    border-radius: 4px;
    background: var(--c, #ff6b9d);
    animation: fall 3.2s cubic-bezier(.17,.67,.2,1) forwards;
    will-change: transform, opacity;
  }
  :global(.confetti-heart) {
    width: 10px;
    height: 10px;
    display: grid;
    place-items: center;
    background: var(--c, #ff6b9d);
    color: var(--c, #ff6b9d);
    border-radius: 999px;
    font-size: 14px;
    font-weight: 900;
    box-shadow: 0 0 14px color-mix(in srgb, var(--c, #ff6b9d) 42%, transparent);
    animation: heartBurst 1.45s cubic-bezier(.16,.84,.25,1) forwards;
  }
  :global(.confetti-heart:not(:empty)) {
    width: auto;
    height: auto;
    background: transparent;
  }
  /* ── V10.3 fever extras ─────────────────────────────────────────────── */
  .fever-flash {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9998;
    opacity: 0;
    background:
      radial-gradient(circle at 82% 82%, color-mix(in srgb, var(--accent, #ec4899) 45%, transparent), transparent 55%),
      color-mix(in srgb, var(--accent, #ec4899) 12%, transparent);
  }
  :global(.fever-flash.flash-on) {
    animation: fever-flash 260ms ease-out;
  }
  :global(.fever-flash.flash-hard) {
    animation: fever-flash-hard 320ms ease-out;
  }
  @keyframes fever-flash {
    0% { opacity: 0; }
    25% { opacity: 0.55; }
    100% { opacity: 0; }
  }
  @keyframes fever-flash-hard {
    0% { opacity: 0; }
    18% { opacity: 0.95; }
    45% { opacity: 0.35; }
    62% { opacity: 0.75; }
    100% { opacity: 0; }
  }
  .fever-combo {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    opacity: 0;
    font-size: 1.5rem;
    font-weight: 900;
    color: #fff;
    -webkit-text-stroke: 1.5px var(--accent, #ec4899);
    text-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    transform: translateX(-50%) scale(var(--combo-scale, 1));
  }
  :global(.fever-combo.combo-on) {
    opacity: 1;
  }
  :global(.fever-combo.combo-pop) {
    animation: combo-pop 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes combo-pop {
    0% { transform: translateX(-50%) scale(0.6); }
    60% { transform: translateX(-50%) scale(calc(var(--combo-scale, 1) * 1.25)); }
    100% { transform: translateX(-50%) scale(var(--combo-scale, 1)); }
  }
  :global(.confetti-piece.piece-glow) {
    box-shadow: 0 0 12px color-mix(in srgb, var(--c, #ff6b9d) 75%, transparent);
  }
  :global(.confetti-piece.piece-frenzy) {
    box-shadow: 0 0 18px var(--c, #ff6b9d), 0 0 34px color-mix(in srgb, var(--c, #ff6b9d) 55%, transparent);
    filter: saturate(1.5) brightness(1.15);
  }

  /* Applied to #main-content + the sticky nav bars (never body/.app —
     a transform there re-anchors every position:fixed element). */
  :global(.presuntinho-shake) {
    animation: presuntinho-screen-shake 420ms cubic-bezier(.36,.07,.19,.97) both;
  }
  :global(.presuntinho-shake--hard) {
    animation: presuntinho-screen-shake-hard 420ms cubic-bezier(.36,.07,.19,.97) both;
  }
  @keyframes presuntinho-screen-shake-hard {
    0%, 100% { transform: translate3d(0,0,0) rotate(0); }
    12% { transform: translate3d(-7px,5px,0) rotate(-0.8deg); }
    24% { transform: translate3d(8px,-5px,0) rotate(0.8deg); }
    36% { transform: translate3d(-9px,3px,0) rotate(-0.6deg); }
    48% { transform: translate3d(9px,4px,0) rotate(0.6deg); }
    60% { transform: translate3d(-6px,-3px,0) rotate(-0.4deg); }
    72% { transform: translate3d(6px,3px,0) rotate(0.4deg); }
    84% { transform: translate3d(-2px,0,0) rotate(-0.15deg); }
  }
  @keyframes presuntinho-screen-shake {
    0%, 100% { transform: translate3d(0,0,0) rotate(0); }
    12% { transform: translate3d(-3px,2px,0) rotate(-0.35deg); }
    24% { transform: translate3d(4px,-2px,0) rotate(0.35deg); }
    36% { transform: translate3d(-5px,1px,0) rotate(-0.25deg); }
    48% { transform: translate3d(5px,2px,0) rotate(0.25deg); }
    60% { transform: translate3d(-3px,-1px,0) rotate(-0.18deg); }
    72% { transform: translate3d(3px,1px,0) rotate(0.18deg); }
    84% { transform: translate3d(-1px,0,0) rotate(-0.08deg); }
  }
  @keyframes fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  @keyframes heartBurst {
    0% { transform: translate3d(0,0,0) rotate(0deg) scale(var(--scale, 1)); opacity: 1; }
    55% { opacity: .95; }
    100% { transform: translate3d(var(--dx, -120px), -58vh, 0) rotate(var(--spin, 720deg)) scale(.3); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.confetti-piece) {
      animation: none;
      display: none;
    }
    :global(.presuntinho-shake),
    :global(.presuntinho-shake--hard),
    :global(.fever-flash.flash-on),
    :global(.fever-flash.flash-hard),
    :global(.fever-combo.combo-pop) {
      animation: none;
    }
    .fever-flash,
    .fever-combo {
      display: none;
    }
  }
</style>