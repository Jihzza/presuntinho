<script lang="ts">
  /**
   * Hub card — Hábitos.
   *
   * Shows two numbers from Dexie:
   *   1. Habits logged today — `count(distinct habitId where log.date = today)`.
   *   2. Best global streak — `max(getStreak(h.id))` across every habit.
   *
   * The "best streak" needs every habit's individual streak, so we
   * fan out N getStreak() calls in parallel.  N is bounded by the
   * `habitos` table (8 default seeds, typically <20 for a real
   * user), so the cost is fine.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { db } from '$lib/state/db';
  import { getStreak } from '$lib/habitos';

  interface Props {
    href?: string;
  }
  let { href = '/habitos' }: Props = $props();

  let doneToday = $state(0);
  let totalHabits = $state(0);
  let bestStreak = $state(0);
  let loading = $state(true);

  function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  onMount(() => {
    void (async () => {
      if (typeof indexedDB === 'undefined') {
        loading = false;
        return;
      }
      try {
        const today = localDateKey(new Date());
        const [habits, logs] = await Promise.all([
          db().habitos.toArray(),
          db().habit_logs.where('date').equals(today).toArray()
        ]);
        const resolved = habits.filter((h): h is typeof h & { id: number } => typeof h.id === 'number');
        totalHabits = resolved.length;

        const distinctToday = new Set<number>();
        for (const l of logs) {
          if (l.done) distinctToday.add(l.habitId);
        }
        doneToday = distinctToday.size;

        // Compute streak per habit in parallel; take the max.
        const streaks = await Promise.all(resolved.map((h) => getStreak(h.id)));
        bestStreak = streaks.length > 0 ? Math.max(0, ...streaks) : 0;
      } catch (e) {
        console.error('[hub][habitos] read failed', e);
      } finally {
        loading = false;
      }
    })();
  });

  let todayLabel = $derived(
    $t('routes.hub.card.habitos.today', {
      values: { done: doneToday, total: totalHabits },
      default: '{done}/{total} hoje'
    })
  );
  let bestLabel = $derived(
    $t('routes.hub.card.habitos.best', {
      values: { n: bestStreak },
      default: 'Melhor streak: {n} dias'
    })
  );
</script>

<a
  class="card"
  {href}
  style="--accent: #8b5cf6"
  aria-label={$t('routes.hub.card.habitos.aria', { default: 'Hábitos — streaks e atividade de hoje' })}
>
  <div class="icon" aria-hidden="true">🌱</div>
  <div class="content">
    <h2>{$t('routes.hub.card.habitos.title', { default: 'Hábitos' })}</h2>
    <p class="big">
      <span class="num">{doneToday}</span>
      <span class="slash">/</span>
      <span class="den">{totalHabits}</span>
    </p>
    <p class="meta">
      {loading
        ? $t('routes.hub.card.habitos.loading', { default: 'A carregar…' })
        : todayLabel}
    </p>
    <p class="streak">
      <span class="flame" aria-hidden="true">🔥</span>
      {bestLabel}
    </p>
  </div>
  <div class="arrow" aria-hidden="true">→</div>
</a>

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--accent);
    border-radius: 0.75rem;
    color: #fff;
    text-decoration: none;
    transition: background 0.2s, transform 0.15s;
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
    font-size: 2.25rem;
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
    font-size: 1.0625rem;
    margin: 0 0 0.125rem 0;
    color: #fff;
    font-weight: 600;
  }
  .big {
    margin: 0;
    font-variant-numeric: tabular-nums;
    line-height: 1.05;
  }
  .num {
    font-size: 1.75rem;
    font-weight: 700;
    color: #fff;
  }
  .slash {
    color: #64748b;
    font-size: 1.25rem;
    margin: 0 0.125rem;
  }
  .den {
    font-size: 1.25rem;
    color: #cbd5e1;
    font-weight: 600;
  }
  .meta {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0.125rem 0 0 0;
  }
  .streak {
    font-size: 0.8125rem;
    color: #fde68a;
    margin: 0.25rem 0 0 0;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-variant-numeric: tabular-nums;
  }
  .flame {
    font-size: 0.95rem;
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
