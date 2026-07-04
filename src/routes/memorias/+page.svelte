<script lang="ts">
  // Memórias — romantic timeline of everything lived inside the app.
  //
  // Derived 100% from EXISTING data (no new schema):
  //   - badges.unlockedAt          → achievements
  //   - secrets.discoveredAt       → easter-egg discoveries
  //   - secrets 'heart_tier_<n>'   → heart tier crossings (easterEggs.ts V8)
  //   - mood_logs kind 'love'      → love-mode episodes
  //   - events kind 'special'      → special dates + love notes
  //   - notes.createdAt            → caderno notes
  //
  // Merged, sorted newest-first and rendered as a soft vertical timeline
  // with month separators.  The "love note" quick-add writes an events row
  // (kind 'special', today) and awards XP via the central table.

  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import { db } from '$lib/state/db';
  import { awardXP } from '$lib/state/xp-actions';
  import { fireConfettiEvent, showToast } from '$lib/components/events';
  import { getSecrets, getBadges } from '$lib/easterEggsConfig';

  type MemoryType = 'badge' | 'secret' | 'tier' | 'love' | 'special' | 'note';

  interface MemoryItem {
    ts: number;
    type: MemoryType;
    icon: string;
    /** badge label / secret config name / event title / note title */
    name?: string;
    /** config secret id (for i18n name lookup) */
    secretId?: string;
    /** heart tier click count */
    at?: number;
    /** secondary line (event notes, mood note) */
    sub?: string;
  }

  interface MonthGroup {
    key: string;
    ts: number;
    items: MemoryItem[];
  }

  const NOTE_ICONS: Record<string, string> = {
    text: '📝',
    audio: '🎙️',
    image: '🖼️',
    file: '📎'
  };

  let items = $state<MemoryItem[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let noteText = $state('');
  let saving = $state(false);

  /** Parse a LOCAL 'YYYY-MM-DD' string to a timestamp at local noon. */
  function parseLocalDate(dateStr: string | undefined): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? '');
    if (!m) return 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getTime();
  }

  /** Today as a LOCAL 'YYYY-MM-DD' string. */
  function todayLocal(): string {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  async function load(): Promise<void> {
    if (typeof indexedDB === 'undefined') return; // SSR guard
    try {
      const d = db();
      const [secretCatalog, badgeCatalog, secretRows, badgeRows, loveRows, specialRows, noteRows] =
        await Promise.all([
          getSecrets(),
          getBadges(),
          d.secrets.toArray(),
          d.badges.toArray(),
          d.mood_logs.where('kind').equals('love').toArray(),
          d.events.where('kind').equals('special').toArray(),
          d.notes.toArray()
        ]);

      const secretById = new Map(secretCatalog.map((s) => [s.id, s]));
      const badgeById = new Map(badgeCatalog.map((b) => [b.id, b]));
      const merged: MemoryItem[] = [];

      for (const r of badgeRows) {
        if (!r.unlocked || !r.unlockedAt) continue;
        const meta = badgeById.get(r.id);
        merged.push({
          ts: r.unlockedAt,
          type: 'badge',
          icon: meta?.icon ?? '🏷️',
          name: meta?.label ?? r.id
        });
      }

      for (const r of secretRows) {
        if (!r.discovered || !r.discoveredAt) continue;
        const tierMatch = /^heart_tier_(\d+)$/.exec(r.id);
        if (tierMatch) {
          merged.push({ ts: r.discoveredAt, type: 'tier', icon: '💗', at: Number(tierMatch[1]) });
          continue;
        }
        const meta = secretById.get(r.id);
        merged.push({
          ts: r.discoveredAt,
          type: 'secret',
          icon: meta?.icon ?? '🔮',
          name: meta?.name ?? r.id,
          secretId: r.id
        });
      }

      for (const r of loveRows) {
        merged.push({
          ts: r.startedAt || parseLocalDate(r.date),
          type: 'love',
          icon: '💕',
          sub: r.note
        });
      }

      for (const r of specialRows) {
        merged.push({
          ts: parseLocalDate(r.date) || r.createdAt,
          type: 'special',
          icon: r.icon || '💗',
          name: r.title,
          sub: r.notes
        });
      }

      for (const r of noteRows) {
        if (!r.createdAt) continue;
        merged.push({
          ts: r.createdAt,
          type: 'note',
          icon: NOTE_ICONS[r.kind] ?? '📝',
          name: r.title
        });
      }

      merged.sort((a, b) => b.ts - a.ts);
      items = merged;
      loadError = null;
    } catch (e) {
      console.error('[memorias] load failed', e);
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // Group items by month, newest month first (items are already sorted).
  let groups = $derived.by(() => {
    const map = new Map<string, MonthGroup>();
    for (const it of items) {
      const d = new Date(it.ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let g = map.get(key);
      if (!g) {
        g = { key, ts: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), items: [] };
        map.set(key, g);
      }
      g.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => b.ts - a.ts);
  });

  function monthLabel(ts: number): string {
    return new Date(ts).toLocaleDateString($locale || 'pt-PT', { month: 'long', year: 'numeric' });
  }

  function dayLabel(ts: number): string {
    return new Date(ts).toLocaleDateString($locale || 'pt-PT', { day: 'numeric', month: 'short' });
  }

  function itemTitle(it: MemoryItem): string {
    switch (it.type) {
      case 'badge':
        return $t('memorias.item.badge', {
          values: { name: it.name ?? '' },
          default: `Conquista desbloqueada: ${it.name ?? ''}`
        });
      case 'secret': {
        const localizedName = it.secretId
          ? $t(`secrets.egg.${it.secretId}.name`, { default: it.name ?? it.secretId })
          : (it.name ?? '');
        return $t('memorias.item.secret', {
          values: { name: localizedName },
          default: `Segredo descoberto: ${localizedName}`
        });
      }
      case 'tier':
        return $t('memorias.item.heartTier', {
          values: { at: it.at ?? 0 },
          default: `O coração chegou a ${it.at ?? 0} cliques 💗`
        });
      case 'love':
        return $t('memorias.item.love', { default: 'Um dia em modo carinho 💕' });
      case 'special':
        return it.name || $t('memorias.item.special', { default: 'Um dia especial 💗' });
      case 'note':
        return it.name
          ? $t('memorias.item.note', { values: { title: it.name }, default: `Nota: ${it.name}` })
          : $t('memorias.item.noteUntitled', { default: 'Nota no caderno' });
    }
  }

  async function addLoveNote(): Promise<void> {
    const text = noteText.trim();
    if (!text || saving) return;
    saving = true;
    try {
      await db().events.add({
        date: todayLocal(),
        title: text,
        icon: '💌',
        kind: 'special',
        createdAt: Date.now()
      });
      await awardXP('event_add');
      showToast($t('memorias.loveNote.added', { default: '💌 Memória guardada com carinho.' }));
      fireConfettiEvent(24);
      noteText = '';
      await load();
    } catch (e) {
      console.error('[memorias] love note failed', e);
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  function onNoteKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addLoveNote();
    }
  }

  onMount(() => {
    void load();
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });
</script>

<svelte:head>
  <title>🕰️ {$t('routes.memorias.title', { default: 'Memórias' })} · Presuntinho</title>
</svelte:head>

<div class="memorias">
  <header class="head">
    <p class="breadcrumb">
      <a href="/">{$t('memorias.breadcrumb.home', { default: '← Hub' })}</a>
      <span class="sep">›</span>
      <span>{$t('memorias.breadcrumb.current', { default: 'Memórias' })}</span>
    </p>
    <span class="tag">{$t('memorias.tag', { default: 'Linha do tempo' })}</span>
    <h1>
      {$t('memorias.heading', { default: '🕰️ Memórias' })}
      {#if !loading && items.length > 0}
        <span class="counter" aria-live="polite">
          {$t('memorias.count', { values: { count: items.length }, default: `${items.length} momentos guardados` })}
        </span>
      {/if}
    </h1>
    <p class="sub">{$t('memorias.subtitle', { default: 'Todos os momentos bonitos — conquistas, segredos, mimos e notas — num só sítio.' })}</p>
  </header>

  <!-- Love-note quick-add: writes an events row (kind 'special', today). -->
  <section class="card love-note" aria-label={$t('memorias.loveNote.title', { default: '💌 Nota de amor' })}>
    <h2>{$t('memorias.loveNote.title', { default: '💌 Nota de amor' })}</h2>
    <div class="love-note-row">
      <input
        type="text"
        maxlength="140"
        bind:value={noteText}
        onkeydown={onNoteKeydown}
        placeholder={$t('memorias.loveNote.placeholder', { default: 'Escreve um momento fofinho para guardar…' })}
        aria-label={$t('memorias.loveNote.aria', { default: 'Escrever uma nota de amor' })}
        disabled={saving}
      />
      <button
        type="button"
        class="cta"
        onclick={() => void addLoveNote()}
        disabled={saving || !noteText.trim()}
      >
        {$t('memorias.loveNote.add', { default: 'Guardar' })}
      </button>
    </div>
  </section>

  {#if loadError}
    <p class="error">{$t('memorias.error', { values: { error: loadError }, default: `Não consegui carregar as memórias: ${loadError}` })}</p>
  {/if}

  {#if loading}
    <p class="loading">{$t('memorias.loading', { default: 'A carregar memórias…' })}</p>
  {:else if items.length === 0}
    <div class="empty card">
      <div class="empty-icon" aria-hidden="true">🐷💞</div>
      <h2>{$t('memorias.empty.title', { default: 'Ainda sem memórias' })}</h2>
      <p>{$t('memorias.empty.body', { default: 'Explora a app, descobre segredos e guarda notas de amor — cada momento bonito aparece aqui.' })}</p>
    </div>
  {:else}
    <section class="timeline" aria-label={$t('memorias.aria.timeline', { default: 'Linha do tempo de memórias' })}>
      {#each groups as g (g.key)}
        <h2 class="month">{monthLabel(g.ts)}</h2>
        <ol class="month-items" role="list">
          {#each g.items as it, i (`${g.key}-${i}`)}
            <li class="item item-{it.type}">
              <div class="marker" aria-hidden="true">
                <span class="marker-icon">{it.icon}</span>
              </div>
              <div class="body">
                <p class="title">{itemTitle(it)}</p>
                {#if it.sub}
                  <p class="note">{it.sub}</p>
                {/if}
              </div>
              <time class="when" datetime={new Date(it.ts).toISOString()}>{dayLabel(it.ts)}</time>
            </li>
          {/each}
        </ol>
      {/each}
    </section>
  {/if}
</div>

<style>
  .memorias {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-5, 1.5rem) var(--space-4, 1rem) var(--space-6, 3rem);
  }
  .head { margin-bottom: var(--space-5, 1.5rem); }
  .head h1 {
    color: var(--txt, #fff);
    margin: 0.25rem 0 0.5rem;
    font-size: var(--fs-2xl, 2rem);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3, 0.75rem);
  }
  .counter {
    font-size: var(--fs-sm, 0.9rem);
    color: var(--txt2, #cbd5e1);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .breadcrumb {
    color: var(--txt3, #94a3b8);
    font-size: var(--fs-xs, 0.85rem);
    margin: 0 0 0.5rem;
  }
  .breadcrumb a {
    color: var(--accent);
    text-decoration: none;
    border-radius: var(--radius-sm, 0.375rem);
  }
  .breadcrumb a:hover { text-decoration: underline; }
  .breadcrumb a:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .breadcrumb .sep { margin: 0 0.4rem; opacity: 0.6; }
  .tag {
    display: inline-block;
    padding: 0.15rem 0.6rem;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    color: var(--txt, #fff);
    border-radius: 999px;
    font-size: var(--fs-xs, 0.72rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }
  .sub { color: var(--txt2, #cbd5e1); margin: 0; }

  .card {
    background: var(--card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-lg, 0.75rem);
    padding: var(--space-4, 1.25rem);
    margin-bottom: var(--space-4, 1rem);
  }
  .card h2 {
    color: var(--txt, #fff);
    font-size: var(--fs-lg, 1.15rem);
    margin: 0 0 0.6rem;
  }

  /* Love-note quick-add. */
  .love-note-row {
    display: flex;
    gap: var(--space-2, 0.5rem);
    flex-wrap: wrap;
  }
  .love-note-row input {
    flex: 1;
    min-width: 200px;
    min-height: 44px;
    padding: 0.55rem 0.85rem;
    background: var(--bg-elev, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.5rem);
    color: var(--txt, #fff);
    font: inherit;
  }
  .love-note-row input::placeholder { color: var(--txt3, #94a3b8); }
  .love-note-row input:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .cta {
    min-height: 44px;
    min-width: 44px;
    padding: 0.55rem 1.1rem;
    background: var(--accent);
    color: var(--on-accent, #fff);
    border: 0;
    border-radius: var(--radius-md, 0.5rem);
    font-weight: 600;
    font: inherit;
    cursor: pointer;
    transition: background var(--motion-base, 220ms) ease;
  }
  .cta:hover:not(:disabled),
  .cta:focus-visible {
    background: var(--accent-hover);
    outline: none;
  }
  .cta:focus-visible {
    box-shadow: 0 0 0 2px var(--on-accent, #fff);
  }
  .cta:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .error {
    color: var(--error, #ef4444);
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--error, #ef4444) 30%, transparent);
    border-radius: var(--radius-md, 0.5rem);
  }
  .loading {
    color: var(--txt3, #94a3b8);
    text-align: center;
    padding: var(--space-5, 1.5rem) 0;
  }

  /* Empty state. */
  .empty {
    text-align: center;
    padding: var(--space-6, 2.5rem) var(--space-4, 1.25rem);
  }
  .empty-icon {
    font-size: 2.6rem;
    margin-bottom: 0.5rem;
  }
  .empty p {
    color: var(--txt2, #cbd5e1);
    margin: 0.4rem auto 0;
    max-width: 34ch;
    line-height: 1.55;
  }

  /* Soft vertical timeline. */
  .timeline { margin-top: var(--space-4, 1rem); }
  .month {
    color: var(--txt2, #cbd5e1);
    font-size: var(--fs-sm, 0.85rem);
    font-weight: 700;
    text-transform: capitalize;
    letter-spacing: 0.04em;
    margin: var(--space-5, 1.5rem) 0 var(--space-3, 0.75rem);
    display: flex;
    align-items: center;
    gap: var(--space-3, 0.75rem);
  }
  .month::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border, rgba(255, 255, 255, 0.08));
  }
  .month-items {
    list-style: none;
    margin: 0;
    padding: 0 0 0 var(--space-2, 0.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 0.75rem);
    position: relative;
  }
  /* Vertical line behind the markers. */
  .month-items::before {
    content: '';
    position: absolute;
    top: 0.5rem;
    bottom: 0.5rem;
    left: calc(var(--space-2, 0.5rem) + 21px);
    width: 2px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent) 35%, transparent),
      color-mix(in srgb, var(--accent) 8%, transparent)
    );
    border-radius: 999px;
  }
  .item {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: var(--space-3, 0.75rem);
    padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
    background: var(--card, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-md, 0.6rem);
    position: relative;
  }
  .marker {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    flex-shrink: 0;
    z-index: 1;
  }
  .item-badge .marker {
    background: color-mix(in srgb, var(--warning) 14%, transparent);
    border-color: color-mix(in srgb, var(--warning) 32%, transparent);
  }
  .item-note .marker {
    background: color-mix(in srgb, var(--success) 12%, transparent);
    border-color: color-mix(in srgb, var(--success) 28%, transparent);
  }
  .body { min-width: 0; }
  .title {
    margin: 0;
    color: var(--txt, #fff);
    font-size: var(--fs-sm, 0.95rem);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .note {
    margin: 0.15rem 0 0;
    color: var(--txt3, #94a3b8);
    font-size: var(--fs-xs, 0.8rem);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .when {
    color: var(--txt3, #94a3b8);
    font-size: var(--fs-xs, 0.75rem);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    align-self: start;
    padding-top: 0.2rem;
  }

  @media (max-width: 480px) {
    .item {
      grid-template-columns: 38px 1fr auto;
    }
    .marker {
      width: 38px;
      height: 38px;
      font-size: 1.05rem;
    }
    .month-items::before {
      left: calc(var(--space-2, 0.5rem) + 18px);
    }
  }
</style>
