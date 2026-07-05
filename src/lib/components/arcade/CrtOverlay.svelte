<script lang="ts">
  /**
   * Tasteful CRT screen overlay — pure CSS, one composite, no JS per frame.
   * Absolutely fills its positioned parent, ignores pointer events (so the
   * canvas underneath still gets taps) and is aria-hidden. Scanlines + vignette
   * + a faint accent bloom; an optional slow flicker only under
   * prefers-reduced-motion: no-preference. It never geometrically warps the
   * surface, so canvas touch coordinates stay exact.
   */
  interface Props {
    /** 0 = invisible, 1 = full. Scales every layer's opacity. */
    intensity?: number;
    /** Draw the horizontal scanlines (vignette + bloom always paint). */
    scanlines?: boolean;
    /** Radius to match the parent's rounded corners. */
    radius?: string;
  }
  let { intensity = 0.5, scanlines = true, radius = '0.9rem' }: Props = $props();
</script>

<div
  class="crt"
  class:with-scanlines={scanlines}
  aria-hidden="true"
  style={`--crt: ${Math.max(0, Math.min(1, intensity))}; --crt-radius: ${radius};`}
></div>

<style>
  .crt {
    position: absolute;
    inset: 0;
    border-radius: var(--crt-radius);
    pointer-events: none;
    z-index: 4;
    overflow: hidden;
    /* Vignette + a soft accent bloom in the top-centre, like a warm tube. */
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent, #67e8f9) 14%, transparent), transparent 60%),
      radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, calc(0.42 * var(--crt))) 100%);
    box-shadow: inset 0 0 calc(2.4rem * var(--crt)) rgba(0, 0, 0, calc(0.5 * var(--crt)));
  }
  /* Scanlines as a separate layer so they can be toggled independently. */
  .crt.with-scanlines::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent 0 2px,
      rgba(0, 0, 0, calc(0.22 * var(--crt))) 2px 3px
    );
    mix-blend-mode: multiply;
  }
  /* A hair of moving glare only when motion is welcome. */
  @media (prefers-reduced-motion: no-preference) {
    .crt::after {
      content: '';
      position: absolute;
      inset: -20% -10%;
      background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, calc(0.05 * var(--crt))) 50%, transparent 58%);
      animation: crt-sweep 7.5s linear infinite;
    }
    @keyframes crt-sweep {
      0% { transform: translateY(-60%); opacity: 0; }
      12% { opacity: 1; }
      40% { opacity: 0; }
      100% { transform: translateY(60%); opacity: 0; }
    }
  }
</style>
