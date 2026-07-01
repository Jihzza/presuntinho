<script lang="ts">
  /**
   * Hub card — Finanças.
   *
   * Surfaces two facts from the Dexie `transacoes` and `categorias`
   * tables for the current month:
   *   1. The month's net balance (receitas - despesas), formatted
   *      in pt-PT EUR.
   *   2. The top 3 categories by despesa (with their display name
   *      + colour + emoji resolved from the categorias lookup).
   *
   * Empty state: when there are zero transactions in the current
   * month the card shows a friendly "nenhuma transação este mês"
   * line instead of "€0,00 / empty" — gives the user an obvious
   * reason to tap the card.
   */
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { db, type CategoriaRow } from '$lib/state/db';

  interface Props {
    href?: string;
  }
  let { href = '/financas' }: Props = $props();

  interface TopCategory {
    id: string;
    nome: string;
    icone: string;
    cor: string;
    total: number;
  }

  let saldo = $state(0);
  let receitas = $state(0);
  let despesas = $state(0);
  let topCats = $state<TopCategory[]>([]);
  let hasAnyTx = $state(false);
  let loading = $state(true);

  function getMesAtual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatValor(v: number): string {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(v);
  }

  onMount(() => {
    void (async () => {
      if (typeof indexedDB === 'undefined') {
        loading = false;
        return;
      }
      try {
        const mes = getMesAtual();
        // Month range as YYYY-MM-DD strings for an inclusive filter.
        const start = `${mes}-01`;
        const end = `${mes}-31`;
        const [txs, cats] = await Promise.all([
          db().transacoes.where('data').between(start, end, true, true).toArray(),
          db().categorias.toArray()
        ]);
        hasAnyTx = txs.length > 0;

        let rec = 0;
        let desp = 0;
        const porCat: Record<string, number> = {};
        for (const t of txs) {
          if (t.tipo === 'receita') rec += t.valor;
          else if (t.tipo === 'despesa') {
            desp += t.valor;
            porCat[t.categoria] = (porCat[t.categoria] ?? 0) + t.valor;
          }
        }
        receitas = rec;
        despesas = desp;
        saldo = rec - desp;

        const catMap = new Map<string, CategoriaRow>(cats.map((c) => [c.id, c]));
        const sorted = Object.entries(porCat)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        topCats = sorted.map(([id, total]) => {
          const c = catMap.get(id);
          return {
            id,
            nome: c?.nome ?? id,
            icone: c?.icone ?? '💸',
            cor: c?.cor ?? '#94a3b8',
            total
          };
        });
      } catch (e) {
        console.error('[hub][financas] read failed', e);
      } finally {
        loading = false;
      }
    })();
  });

  // Locale-aware EUR formatter with cents (used for the balance line).
  let saldoLabel = $derived(formatValor(saldo));
  let saldoClass = $derived(saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : 'zero');
</script>

<a
  class="card"
  {href}
  style="--accent: #10b981"
  aria-label={$t('routes.hub.card.financas.aria', { default: 'Finanças — saldo do mês e categorias' })}
>
  <div class="icon" aria-hidden="true">💰</div>
  <div class="content">
    <h2>{$t('routes.hub.card.financas.title', { default: 'Finanças' })}</h2>
    <p class="balance {saldoClass}">{saldoLabel}</p>
    <p class="sub">
      {$t('routes.hub.card.financas.sub', {
        values: { rec: formatValor(receitas), desp: formatValor(despesas) },
        default: '↗ {rec} · ↘ {desp}'
      })}
    </p>
    {#if loading}
      <p class="empty">{$t('routes.hub.card.financas.loading', { default: 'A carregar…' })}</p>
    {:else if !hasAnyTx}
      <p class="empty">
        {$t('routes.hub.card.financas.empty', { default: 'Sem transações este mês — toca para começar.' })}
      </p>
    {:else if topCats.length === 0}
      <p class="empty">
        {$t('routes.hub.card.financas.no_expenses', { default: 'Só receitas até agora.' })}
      </p>
    {:else}
      <ul class="top-list" aria-label={$t('routes.hub.card.financas.top_aria', { default: 'Top categorias por despesa' })}>
        {#each topCats as cat (cat.id)}
          <li>
            <span class="dot" style="background: {cat.cor}" aria-hidden="true"></span>
            <span class="cat-icon" aria-hidden="true">{cat.icone}</span>
            <span class="cat-name">{cat.nome}</span>
            <span class="cat-val">{formatValor(cat.total)}</span>
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
    margin: 0 0 0.25rem 0;
    color: #fff;
    font-weight: 600;
  }
  .balance {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.125rem 0;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .balance.pos { color: #34d399; }
  .balance.neg { color: #f87171; }
  .balance.zero { color: #e5e7eb; }
  .sub {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0 0 0.5rem 0;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    font-size: 0.8125rem;
    color: #cbd5e1;
    margin: 0;
    font-style: italic;
  }
  .top-list {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .top-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: #e5e7eb;
    min-height: 28px;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cat-icon {
    flex-shrink: 0;
    width: 1.25rem;
    text-align: center;
  }
  .cat-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cat-val {
    font-variant-numeric: tabular-nums;
    color: #fde68a;
    font-weight: 600;
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
