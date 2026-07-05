<script lang="ts">
  /**
   * MascotAvatar — a mascote ATIVA em arte profissional (V10.4).
   *
   * Substitui o PigMascot SVG nos pontos de celebração/companhia: renderiza
   * o webp da pose pedida (ou derivada da emoção) com vida em CSS —
   * respiração/bob suave, entrada em "pop" opcional e drop-shadow no
   * recorte (as artes têm fundo transparente; a sombra vem daqui).
   *
   * `size` é a ALTURA em px; a largura acompanha o rácio da arte.
   * `alt` vazio = decorativo (aria-hidden), como os PigMascot antigos.
   */
  import type { MascotEmotion } from '$lib/gamification/emotion';
  import { mascotArt, poseForEmotion, type MascotPose } from '$lib/gamification/mascots';

  interface Props {
    /** Id do catálogo (mascots.ts) — ids desconhecidos caem no default. */
    mascot: string;
    /** Pose explícita; vence a emoção. */
    pose?: MascotPose | null;
    /** Emoção do dia (mapa em poseForEmotion) quando não há pose. */
    emotion?: MascotEmotion;
    /** Altura em px. */
    size?: number;
    /** Vida ambiente (bob suave). */
    animate?: boolean;
    /** Entrada em pop (para overlays de celebração). */
    entrance?: boolean;
    /** Espelha horizontalmente (personagens nas margens do caminho). */
    flip?: boolean;
    /** Texto alternativo; vazio = decorativo. */
    alt?: string;
    /** Carregamento prioritário (above the fold). */
    eager?: boolean;
    /** Render chunky 8-bit (pixelated upscale + hard pixel shadow). */
    pixelated?: boolean;
  }
  let {
    mascot,
    pose = null,
    emotion = 'happy',
    size = 64,
    animate = true,
    entrance = false,
    flip = false,
    alt = '',
    eager = false,
    pixelated = false
  }: Props = $props();

  const src = $derived(mascotArt(mascot, pose ?? poseForEmotion(emotion)));

  // 8-bit mode: render the art at ~1/PX resolution then upscale it with
  // nearest-neighbour so it reads as chunky pixels (a smooth webp displayed
  // small just looks smooth; the downscale/upscale is what makes real chunk).
  const PX = 4;
  const pxH = $derived(Math.max(8, Math.round(size / PX)));
  const pxTransform = $derived(flip ? `scaleX(-${PX}) scaleY(${PX})` : `scale(${PX})`);
</script>

<!-- min-width reserva espaço horizontal aproximado antes do decode (os
     rácios das poses variam 0.66–1.21) — evita o salto do texto vizinho. -->
<span
  class="mavatar"
  class:animate
  class:entrance
  class:flip
  class:pixelated
  style="height: {size}px; min-width: {Math.round(size * 0.72)}px;"
  aria-hidden={alt ? undefined : 'true'}
>
  <img
    {src}
    {alt}
    height={size}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
    draggable="false"
    style={pixelated
      ? `height: ${pxH}px; transform: ${pxTransform}; transform-origin: bottom center;`
      : undefined}
  />
</span>

<style>
  .mavatar {
    display: inline-flex;
    align-items: flex-end;
    justify-content: center;
    line-height: 0;
  }
  .mavatar img {
    height: 100%;
    width: auto;
    user-select: none;
    -webkit-user-select: none;
    filter: drop-shadow(0 4px 10px rgba(15, 23, 42, 0.28));
  }
  .mavatar.flip img {
    transform: scaleX(-1);
  }
  /* 8-bit: nearest-neighbour upscale (chunky pixels) + a hard pixel shadow. The
     scale/flip transform is applied inline so it composes with the downscale. */
  .mavatar.pixelated img {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.5)) saturate(1.25) contrast(1.12);
  }
  /* Vida ambiente: bob de respiração com origem no chão. */
  .mavatar.animate img {
    animation: mavatar-bob 3.4s ease-in-out infinite;
    transform-origin: 50% 100%;
  }
  .mavatar.animate.flip img {
    animation: mavatar-bob-flip 3.4s ease-in-out infinite;
  }
  /* Entrada em pop (overlays de celebração). */
  .mavatar.entrance {
    animation: mavatar-pop 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes mavatar-bob {
    0%, 100% { transform: translateY(0) scaleY(1); }
    50% { transform: translateY(-2.5%) scaleY(1.015); }
  }
  @keyframes mavatar-bob-flip {
    0%, 100% { transform: translateY(0) scaleY(1) scaleX(-1); }
    50% { transform: translateY(-2.5%) scaleY(1.015) scaleX(-1); }
  }
  @keyframes mavatar-pop {
    0% { transform: scale(0.4); opacity: 0; }
    70% { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mavatar.animate img,
    .mavatar.animate.flip img,
    .mavatar.entrance {
      animation: none;
    }
  }
</style>
