<!--
  EmptyState — friendly, accessible placeholder for empty lists.

  Used by Trabalhos, Finanças (transações), Hábitos and Biblioteca when
  the underlying store has no rows (or filters return nothing).

  Composition contract:
    * `emoji` is decorative — wrapped with aria-hidden so screen readers
      announce the title + description instead.
    * `title` is rendered as the heading (h3 by default — the page's
      own <h1> is still the page-level heading).
    * `description` is a short helper sentence.
    * `cta` is an optional primary call-to-action: either a `href`
      (renders <a>) or a `label` + `onclick` (renders <button>).  When
      no CTA is supplied the component just shows the message.

  Accessibility:
    * The wrapper has role="status" + aria-live="polite" so the change
      is announced when the list goes from non-empty to empty.
    * All interactive children inherit the page's focus-visible style.
-->
<script lang="ts">
  interface Props {
    /** Decorative emoji shown above the title (e.g. "📭"). */
    emoji: string;
    /** Optional illustration URL — replaces the emoji when provided. */
    art?: string;
    /** Short, sentence-case headline (e.g. "Ainda não tens transações"). */
    title: string;
    /** One-sentence explanation / hint. */
    description?: string;
    /** Primary CTA label (button or link). */
    ctaLabel?: string;
    /** CTA href → renders <a>.  Mutually exclusive with `onCta`. */
    ctaHref?: string;
    /** CTA click handler → renders <button>. */
    onCta?: () => void;
  }

  let {
    emoji,
    art,
    title,
    description,
    ctaLabel,
    ctaHref,
    onCta
  }: Props = $props();
</script>

<div class="empty-state" role="status" aria-live="polite">
  {#if art}
    <img class="art" src={art} alt="" aria-hidden="true" loading="lazy" width="176" height="176" />
  {:else}
    <div class="emoji" aria-hidden="true">{emoji}</div>
  {/if}
  <h3 class="title">{title}</h3>
  {#if description}
    <p class="desc">{description}</p>
  {/if}
  {#if ctaLabel}
    {#if ctaHref}
      <a class="cta" href={ctaHref}>{ctaLabel}</a>
    {:else if onCta}
      <button type="button" class="cta" onclick={onCta} aria-label={ctaLabel}>{ctaLabel}</button>
    {/if}
  {/if}
</div>

<style>
  .empty-state {
    background: var(--card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    padding: 2rem 1.25rem;
    text-align: center;
    color: var(--txt2, #cbd5e1);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .emoji {
    font-size: 3rem;
    line-height: 1;
    /* Gentle float — disabled when the user prefers reduced motion. */
    animation: float 4s ease-in-out infinite;
  }
  .title {
    margin: 0.25rem 0 0 0;
    font-size: 1.0625rem;
    color: var(--txt, #fff);
    font-weight: 600;
  }
  .desc {
    margin: 0 0 0.5rem 0;
    font-size: 0.9375rem;
    color: var(--txt3, #94a3b8);
    max-width: 38ch;
    line-height: 1.45;
  }
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target, 44px);
    background: var(--accent, #ec4899);
    color: var(--on-accent, #fff);
    text-decoration: none;
    padding: 0.55rem 1.1rem;
    border-radius: var(--radius-md, 0.5rem);
    font-weight: 600;
    font-size: 0.9375rem;
    border: 0;
    cursor: pointer;
    font-family: inherit;
    margin-top: 0.25rem;
    transition: background var(--motion-fast, 120ms) ease;
  }
  .cta:hover,
  .cta:focus-visible {
    background: var(--accent-hover, #d63384);
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #ec4899) 45%, transparent);
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-4px); }
  }
  /* Reduced motion: handled by the global kill-switch in app.css
     (animation/transition durations zeroed app-wide). */
  .art {
    width: clamp(128px, 38vw, 176px);
    height: auto;
    margin-bottom: 0.25rem;
    filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.14));
  }
</style>