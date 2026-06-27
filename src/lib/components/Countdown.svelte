<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    deadline: string; // ISO 8601
  }
  let { deadline }: Props = $props();

  let now = $state(Date.now());
  let target = $derived(new Date(deadline).getTime());

  onMount(() => {
    const interval = setInterval(() => { now = Date.now(); }, 60_000); // update every minute
    return () => clearInterval(interval);
  });

  let diff = $derived(target - now);
  let expired = $derived(diff <= 0);
  let days = $derived(Math.floor(diff / (1000 * 60 * 60 * 24)));
  let hours = $derived(Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  let minutes = $derived(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
</script>

{#if expired}
  <p class="expired">⏰ Prazo terminado</p>
{:else}
  <div class="countdown" role="timer" aria-live="polite">
    <span class="unit"><strong>{days}</strong>d</span>
    <span class="unit"><strong>{hours}</strong>h</span>
    <span class="unit"><strong>{minutes}</strong>m</span>
    <span class="label">até {new Date(deadline).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</span>
  </div>
{/if}

<style>
  .countdown {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .unit { color: var(--accent, #ec4899); font-size: 1.25rem; }
  .unit strong { font-size: 1.5rem; margin-right: 0.15rem; }
  .label { color: var(--txt2, #cbd5e1); font-size: 0.9rem; }
  .expired { color: var(--warning, #f59e0b); font-weight: 600; }
</style>