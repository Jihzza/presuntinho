<script lang="ts">
  /**
   * Hub card — Agente.
   *
   * Single static shortcut to /agente. NO greeting copy, NO dummy
   * state — task spec says "NÃO greeting genérico". Just a clean link
   * with an icon + label.
   */
  import { t } from 'svelte-i18n';

  interface Props {
    href?: string;
  }
  let { href = '/agente/' }: Props = $props();
</script>

<a
  class="card"
  {href}
  aria-label={$t('routes.hub.card.agente.aria', { default: 'Abrir agente' })}
>
  <span class="icon" aria-hidden="true">🤖</span>
  <span class="title">{$t('routes.hub.card.agente.title', { default: 'Agente' })}</span>
  <span class="cta">{$t('routes.hub.card.agente.cta', { default: 'Conversar' })} →</span>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 88px;
    padding: 1rem;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    color: #fff;
    text-decoration: none;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .card:hover,
  .card:focus-visible {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25));
    border-color: rgba(99, 102, 241, 0.55);
    outline: none;
    transform: translateY(-1px);
  }
  .card:focus-visible {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.45);
  }
  .icon {
    font-size: 1.5rem;
  }
  .title {
    font-weight: 600;
    font-size: 1rem;
  }
  .cta {
    font-size: 0.8rem;
    color: #c7d2fe;
    margin-top: auto;
  }
</style>