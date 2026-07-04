<script lang="ts">
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';

  function openTrabalhos(): void {
    void goto('/trabalhos/');
  }
</script>

<svelte:head>
  <title>{$t('school.work.seo.title')} · Presuntinho</title>
</svelte:head>

<div class="school-work">
  <a class="back" href="/escola/">{$t('school.work.back')}</a>
  <section class="hero">
    <span>{$t('school.work.kicker')}</span>
    <h1>{$t('school.work.title')}</h1>
    <p>{$t('school.work.body')}</p>
    <button type="button" onclick={openTrabalhos}>{$t('school.work.cta')}</button>
  </section>

  <div class="cards" aria-label={$t('school.work.cards_aria')}>
    <article>
      <strong>{$t('school.work.card.course.title')}</strong>
      <p>{$t('school.work.card.course.body')}</p>
    </article>
    <article>
      <strong>{$t('school.work.card.status.title')}</strong>
      <p>{$t('school.work.card.status.body')}</p>
    </article>
    <article>
      <strong>{$t('school.work.card.next.title')}</strong>
      <p>{$t('school.work.card.next.body')}</p>
    </article>
  </div>
</div>

<style>
  .school-work {
    max-width: 760px;
    margin: 0 auto;
    padding: 1.25rem 1rem 8rem;
  }
  .back {
    display: inline-flex;
    margin-bottom: 0.85rem;
    color: #bfdbfe;
    text-decoration: none;
    font-weight: 800;
  }
  .hero {
    padding: 1.25rem;
    border-radius: 1.25rem;
    color: #fff;
    background: radial-gradient(circle at top left, rgba(245, 158, 11, 0.3), transparent 38%), rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.11);
  }
  .hero span {
    color: #fde68a;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .hero h1 { margin: 0.35rem 0; font-size: clamp(2rem, 7vw, 3rem); line-height: 1; }
  .hero p,
  .cards p { color: var(--txt2); line-height: 1.5; margin: 0; }
  button {
    margin-top: 1rem;
    min-height: 44px;
    border: 0;
    border-radius: 999px;
    padding: 0.75rem 1rem;
    background: #f59e0b;
    color: #111827;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
  }
  .cards {
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
  }
  article {
    padding: 1rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.09);
    color: #fff;
  }
  article strong { display: block; margin-bottom: 0.3rem; }
  @media (min-width: 700px) {
    .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
