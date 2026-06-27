<script lang="ts">
  import type { SubApp } from '$lib/registry';

  interface Props {
    app: SubApp;
  }
  let { app }: Props = $props();
</script>

<a class="card" href={app.route} style="--accent: {app.color}">
  <div class="icon">{app.icon}</div>
  <div class="content">
    <h2>{app.name}</h2>
    <p>{app.description}</p>
  </div>
  <div class="arrow" aria-hidden="true">→</div>
</a>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--accent);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: transform 0.15s, background 0.2s, border-color 0.2s;
    min-height: 88px;
  }
  .card:hover,
  .card:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }
  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .icon {
    font-size: 2.5rem;
    line-height: 1;
    flex-shrink: 0;
    width: 3rem;
    text-align: center;
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .content h2 {
    font-size: 1.125rem;
    margin: 0 0 0.25rem 0;
    color: #fff;
  }
  .content p {
    font-size: 0.875rem;
    margin: 0;
    color: #cbd5e1;
  }
  .arrow {
    color: var(--accent);
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
  }
</style>