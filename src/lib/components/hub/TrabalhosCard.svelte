<script lang="ts">
  /**
   * Hub card — Trabalhos (school assignments).
   *
   * Lists assignments whose deadline is within the next 7 days,
   * ordered by deadline ascending (most urgent first).  Reads the
   * Dexie `assignments` table directly via the `deadline` index.
   *
   * Status filter: hides rows that are `submitted` or `graded`
   * because the user has nothing to do for those.
   */
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { db, type AssignmentRow } from '$lib/state/db';

  interface Props {
    href?: string;
  }
  let { href = '/trabalhos' }: Props = $props();

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WINDOW_DAYS = 7;
  const dateLocale = $derived($locale || 'pt-PT');

  interface Upcoming {
    id: string;
    title: string;
    deadline: number;
    daysLeft: number;
    status: AssignmentRow['status'];
  }

  let upcoming = $state<Upcoming[]>([]);
  let loading = $state(true);

  onMount(() => {
    void (async () => {
      if (typeof indexedDB === 'undefined') {
        loading = false;
        return;
      }
      try {
        const now = Date.now();
        const upper = now + WINDOW_DAYS * DAY_MS;
        const rows = await db().assignments
          .where('deadline')
          .between(now, upper, true, true)
          .toArray();
        const open = rows.filter(
          (r) => r.status !== 'submitted' && r.status !== 'graded'
        );
        const sorted = open.sort((a, b) => a.deadline - b.deadline).slice(0, 3);
        upcoming = sorted.map((r) => ({
          id: r.id,
          title: r.title,
          deadline: r.deadline,
          daysLeft: Math.max(0, Math.ceil((r.deadline - now) / DAY_MS)),
          status: r.status
        }));
      } catch (e) {
        console.error('[hub][trabalhos] read failed', e);
      } finally {
        loading = false;
      }
    })();
  });

  function formatDeadline(deadline: number, daysLeft: number): string {
    if (daysLeft === 0) {
      return $t('routes.hub.card.trabalhos.today', { default: 'Hoje' });
    }
    if (daysLeft === 1) {
      return $t('routes.hub.card.trabalhos.tomorrow', { default: 'Amanhã' });
    }
    const d = new Date(deadline);
    return d.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' });
  }

  function urgency(daysLeft: number): 'soon' | 'mid' | 'late' {
    if (daysLeft <= 1) return 'soon';
    if (daysLeft <= 3) return 'mid';
    return 'late';
  }
</script>

<a
  class="card"
  {href}
  style="--accent: #f59e0b"
  aria-label={$t('routes.hub.card.trabalhos.aria', { default: 'Trabalhos — entregas próximas' })}
>
  <div class="icon" aria-hidden="true">📝</div>
  <div class="content">
    <h2>{$t('routes.hub.card.trabalhos.title', { default: 'Trabalhos' })}</h2>
    {#if loading}
      <p class="empty">{$t('routes.hub.card.trabalhos.loading', { default: 'A carregar…' })}</p>
    {:else if upcoming.length === 0}
      <p class="empty">
        {$t('routes.hub.card.trabalhos.empty', { default: 'Nada para os próximos 7 dias. ✓' })}
      </p>
    {:else}
      <ul class="list" aria-label={$t('routes.hub.card.trabalhos.list_aria', { default: 'Trabalhos com prazo próximo' })}>
        {#each upcoming as t (t.id)}
          <li>
            <span class="pill {urgency(t.daysLeft)}" aria-label={formatDeadline(t.deadline, t.daysLeft)}>
              {formatDeadline(t.deadline, t.daysLeft)}
            </span>
            <span class="title">{t.title}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="arrow" aria-hidden="true">→</div>
</a>

<style>
  .card {
    display: flex;
    align-items: flex-start;
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
    margin: 0 0 0.375rem 0;
    color: #fff;
    font-weight: 600;
  }
  .empty {
    font-size: 0.8125rem;
    color: #cbd5e1;
    margin: 0;
    font-style: italic;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 28px;
  }
  .pill {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    line-height: 1.3;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.1);
    color: #e5e7eb;
  }
  .pill.soon { background: #f87171; color: #1f2937; }
  .pill.mid { background: #fbbf24; color: #1f2937; }
  .pill.late { background: rgba(255, 255, 255, 0.1); color: #cbd5e1; }
  .title {
    font-size: 0.8125rem;
    color: #e5e7eb;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arrow {
    color: var(--accent);
    font-size: 1.25rem;
    flex-shrink: 0;
    align-self: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
  }
</style>
