// Agent engine — keyword router that maps user messages to tools and templates.
//
// Design:
//   - Pure heuristic. NO LLM API needed. Works offline, zero cost.
//   - Portuguese-friendly keyword matching (lowercase, accent-insensitive).
//   - Each handler returns { text: string } the UI displays.
//   - Unknown / off-topic queries get a helpful fallback pointing at the
//     real app sections.
//
// To upgrade to a real LLM later: replace `dispatch()` to call an API
// endpoint with the message + the tool descriptions + a context blob built
// from `runAllTools()`. The UI stays the same.
//
// i18n: every user-visible string lives under routes.agente.engine.* in
// src/lib/i18n/*.json. We use svelte-i18n's `get(t)()` so the engine stays
// SSR-safe (it imports from svelte-i18n but reads the store synchronously
// without subscription). When a key is missing the inline `{ default: '…' }`
// PT fallback is returned — same pattern used in /biblioteca/+page.svelte.

import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import {
  toolFinanceSummary,
  toolFinanceMonth,
  toolHabitsOverview,
  toolSchoolProgress,
  toolVisitedPages,
  toolProfileSummary,
  toolWhatsMissing,
  toolAssignmentsPending,
  toolWeeklySummary,
  type Localised
} from './tools';

export interface AgentReply {
  text: string;
  tool?: string;
}

/** Look up a translation key, falling back to the inline PT string. */
function tt(key: string, fallback: string): string {
  return get(t)(key, { default: fallback });
}

/** Resolve a Localised item produced by a tool to a user-facing string. */
function renderLoc(item: Localised, fallback: string): string {
  return render(tt(item.key, fallback), item.params);
}

/** Replace {placeholders} in a translation template with their values. */
function render(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = values[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .trim();
}

function formatEUR(n: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);
}

function matches(haystack: string, needles: string[]): boolean {
  const h = norm(haystack);
  return needles.some((n) => h.includes(norm(n)));
}

export async function dispatch(userMessage: string): Promise<AgentReply> {
  const msg = userMessage.trim();
  if (!msg) return { text: tt('routes.agente.engine.empty_msg', 'Diz-me algo 😊') };

  // ---- Greetings / small talk ----
  if (matches(msg, ['ola', 'oi', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'como estas'])) {
    return {
      text: tt(
        'routes.agente.engine.greeting',
        'Olá! Sou o teu agente. Posso ver o que está na app — XP, hábitos, finanças, escola. Pergunta-me o que quiseres saber.'
      )
    };
  }

  // ---- "o que falta" / "what's missing" ----
  if (matches(msg, ['o que falta', 'o que me falta', 'que falta', 'pendente', 'por fazer', 'que materia falta', 'que materia', 'o que estudar'])) {
    const r = await toolWhatsMissing();
    if (!r.ok) return { text: tt('routes.agente.engine.error_read_data', 'Não consegui ler os dados agora. Tenta outra vez.') };
    if (r.data.pending.length === 0) {
      return { text: tt('routes.agente.engine.whats_missing.empty', '🎉 Nada pendente! Estás em dia com tudo.') };
    }
    const lines = [
      render(
        tt('routes.agente.engine.whats_missing.header', 'Tens {count} coisa(s) pendente(s):'),
        { count: r.data.pending.length }
      ),
      ...r.data.pending.map((p) => '• ' + renderLoc(p, '')),
      '',
      tt('routes.agente.engine.whats_missing.suggestions_label', 'Sugestões:'),
      ...r.data.suggestions.map((s) => '→ ' + renderLoc(s, ''))
    ];
    return { text: lines.join('\n'), tool: 'whats_missing' };
  }

  // ---- Finanças: resumo / quanto gastei / saldo ----
  if (matches(msg, ['resumo financeiro', 'resumo financas', 'quanto gastei', 'quanto tenho', 'saldo', 'orcamento'])) {
    const r = await toolFinanceSummary();
    if (!r.ok) return { text: tt('routes.agente.engine.finance.error', 'Erro a ler finanças. Tenta outra vez.') };
    const d = r.data;
    if (d.receitas === 0 && d.despesas === 0) {
      return {
        text: tt(
          'routes.agente.engine.finance.empty',
          'Ainda não tens transações este mês. Adiciona a primeira em /financas/nova.'
        )
      };
    }
    return {
      text:
        render(tt('routes.agente.engine.finance.summary_header', '📊 Finanças de {mes}'), { mes: d.mes }) +
        '\n' +
        render(tt('routes.agente.engine.finance.summary_receitas', '• Receitas: {valor}'), { valor: formatEUR(d.receitas) }) +
        '\n' +
        render(tt('routes.agente.engine.finance.summary_despesas', '• Despesas: {valor}'), { valor: formatEUR(d.despesas) }) +
        '\n' +
        render(tt('routes.agente.engine.finance.summary_saldo', '• Saldo: {valor}'), { valor: formatEUR(d.saldo) }) +
        '\n' +
        render(tt('routes.agente.engine.finance.summary_orcamentos', '• Orçamentos ativos: {n}'), { n: d.orcamentosAtivos }),
      tool: 'finance_summary'
    };
  }

  if (matches(msg, ['transacoes', 'lista financas', 'lista transacoes', 'movimentos'])) {
    const r = await toolFinanceMonth();
    if (!r.ok) return { text: tt('routes.agente.engine.finance.transactions_error', 'Erro a ler transações.') };
    if (r.data.transacoes === 0) {
      return { text: tt('routes.agente.engine.finance.transactions_empty', 'Nenhuma transação este mês.') };
    }
    const pluralKey = r.data.transacoes === 1 ? 'routes.agente.engine.finance.transactions_header_one' : 'routes.agente.engine.finance.transactions_header_other';
    const pluralFallback = r.data.transacoes === 1 ? '📋 {n} transação em {mes}' : '📋 {n} transações em {mes}';
    return {
      text:
        render(tt(pluralKey, pluralFallback), {
          n: r.data.transacoes,
          mes: r.data.mes
        }) +
        '\n' +
        render(tt('routes.agente.engine.finance.transactions_despesa', '• Despesa total: {valor}'), { valor: formatEUR(r.data.totalDespesa) }) +
        '\n' +
        render(tt('routes.agente.engine.finance.transactions_receita', '• Receita total: {valor}'), { valor: formatEUR(r.data.totalReceita) }),
      tool: 'finance_month'
    };
  }

  // ---- Hábitos ----
  if (matches(msg, ['habitos', 'habito', 'rotina', 'streak', 'que fiz hoje', 'o que fiz hoje'])) {
    const r = await toolHabitsOverview();
    if (!r.ok) return { text: tt('routes.agente.engine.habits.error', 'Erro a ler hábitos.') };
    if (r.data.totalHabitos === 0) {
      return {
        text: tt(
          'routes.agente.engine.habits.empty',
          'Ainda não tens hábitos criados. Vai a /habitos/novo criar o primeiro.'
        )
      };
    }
    const header = render(
      tt('routes.agente.engine.habits.overview_header', '🌱 Hábitos: {ativos}/{total} marcados hoje'),
      { ativos: r.data.ativosHoje, total: r.data.totalHabitos }
    );
    const itemTpl = tt('routes.agente.engine.habits.item', '{check} {icon} {name}');
    const lines = [
      header,
      ...r.data.lista.map((h) =>
        render(itemTpl, {
          check: h.loggedToday ? '✅' : '⬜',
          icon: h.icon,
          name: h.name
        })
      )
    ];
    return { text: lines.join('\n'), tool: 'habits_overview' };
  }

  // ---- Escola / progresso / xp / nivel ----
  if (matches(msg, ['progresso', 'escola', 'xp', 'nivel', 'badge', 'quiz', 'quanto xp', 'quanto ganhei'])) {
    const r = await toolSchoolProgress();
    if (!r.ok) return { text: tt('routes.agente.engine.school.error', 'Erro a ler progresso.') };
    const p = await toolProfileSummary();
    const xp = p.ok ? p.data.xp : 0;
    return {
      text:
        tt('routes.agente.engine.school.title', '🎓 Escola') +
        '\n' +
        render(tt('routes.agente.engine.school.xp_total', '• XP total: {xp}'), { xp }) +
        '\n' +
        render(tt('routes.agente.engine.school.badges', '• Badges: {n}/{total}'), { n: r.data.badges, total: r.data.badgesTotal }) +
        '\n' +
        render(tt('routes.agente.engine.school.quizzes', '• Quizzes feitos: {n}/{total}'), { n: r.data.quizzesFeitos, total: r.data.quizzesTotal }),
      tool: 'school_progress'
    };
  }

  // ---- "como estou" / "resumo geral" ----
  if (matches(msg, ['como estou', 'resumo geral', 'resumo', 'tudo', 'overview'])) {
    const prof = await toolProfileSummary();
    const fin = await toolFinanceSummary();
    const hab = await toolHabitsOverview();
    const lines = [tt('routes.agente.engine.overview.title', '🌟 Resumo geral:')];
    if (prof.ok) {
      lines.push(
        render(
          tt('routes.agente.engine.overview.xp_line', '• XP: {xp} ({clicks} ❤️ clicks)'),
          { xp: prof.data.xp, clicks: prof.data.heartClicks }
        )
      );
    }
    if (hab.ok) {
      lines.push(
        render(
          tt('routes.agente.engine.overview.habits_line', '• Hábitos hoje: {ativos}/{total}'),
          { ativos: hab.data.ativosHoje, total: hab.data.totalHabitos }
        )
      );
    }
    if (fin.ok && (fin.data.receitas || fin.data.despesas)) {
      lines.push(
        render(
          tt('routes.agente.engine.overview.saldo_line', '• Saldo {mes}: {valor}'),
          { mes: fin.data.mes, valor: formatEUR(fin.data.saldo) }
        )
      );
    }
    return { text: lines.join('\n'), tool: 'profile_summary' };
  }

  // ---- Quick action: "Quanto XP tenho?" ----
  // Mantém-se distinto do handler genérico "progresso" para devolver
  // uma resposta mais focada (sem badges / quizzes) — alinha com o
  // quick-chip que preenche o composer. Lê apenas `state.xp` via
  // toolProfileSummary (single source of truth — não recalcula daqui).
  if (matches(msg, ['quanto xp tenho', 'quanto xp', 'xp total', 'total xp', 'o meu xp'])) {
    const r = await toolProfileSummary();
    if (!r.ok) return { text: tt('routes.agente.engine.school.error', 'Erro a ler progresso.') };
    const xp = r.data.xp;
    return {
      text:
        render(tt('routes.agente.engine.xp_only.title', '⭐ XP atual'), {}) +
        '\n' +
        render(tt('routes.agente.engine.xp_only.line_total', '• Tens {xp} XP acumulados.'), { xp }) +
        '\n' +
        render(tt('routes.agente.engine.xp_only.line_breakdown', '• {badges} badges desbloqueadas · {secrets} secrets.'), {
          badges: r.data.badgesUnlocked,
          secrets: r.data.secretsDiscovered
        }),
      tool: 'xp_only'
    };
  }

  // ---- Quick action: "Hábitos de hoje" ----
  // Variante dedicada — devolve explicitamente o sub/não sub conjunto
  // (vs o handler "habitos" mais curto). Aliases em PT e EN.
  if (matches(msg, ['habitos de hoje', 'habito de hoje', 'habitos hoje', 'meus habitos hoje', 'today habits', "today's habits"])) {
    const r = await toolHabitsOverview();
    if (!r.ok) return { text: tt('routes.agente.engine.habits.error', 'Erro a ler hábitos.') };
    if (r.data.totalHabitos === 0) {
      return {
        text: tt(
          'routes.agente.engine.habits.empty',
          'Ainda não tens hábitos criados. Vai a /habitos/novo criar o primeiro.'
        )
      };
    }
    const done = r.data.lista.filter((h) => h.loggedToday);
    const todo = r.data.lista.filter((h) => !h.loggedToday);
    const itemTpl = tt('routes.agente.engine.habits.item', '{check} {icon} {name}');
    const lines: string[] = [
      render(
        tt('routes.agente.engine.habits_today.header', '🌱 Hábitos de hoje ({ativos}/{total})'),
        { ativos: r.data.ativosHoje, total: r.data.totalHabitos }
      )
    ];
    if (done.length > 0) {
      lines.push(tt('routes.agente.engine.habits_today.done_label', 'Marcados:'));
      lines.push(...done.map((h) => render(itemTpl, { check: '✅', icon: h.icon, name: h.name })));
    }
    if (todo.length > 0) {
      lines.push(tt('routes.agente.engine.habits_today.todo_label', 'Por marcar:'));
      lines.push(...todo.map((h) => render(itemTpl, { check: '⬜', icon: h.icon, name: h.name })));
    }
    return { text: lines.join('\n'), tool: 'habits_today' };
  }

  // ---- Quick action: "Trabalhos pendentes" ----
  // Lista os assignments com status pending/in_progress, ordenados por
  // deadline asc (urgência) com days-left.
  if (matches(msg, ['trabalhos pendentes', 'trabalhos por fazer', 'tarefas pendentes', 'assignments pendentes', 'pending assignments', 'open assignments'])) {
    const r = await toolAssignmentsPending();
    if (!r.ok) return { text: tt('routes.agente.engine.assignments.error', 'Erro a ler trabalhos.') };
    if (r.data.total === 0) {
      return {
        text: tt(
          'routes.agente.engine.assignments.empty',
          '🎉 Não tens trabalhos pendentes. Tudo entregue (ou por começar).'
        )
      };
    }
    const pluralKey = r.data.total === 1 ? 'routes.agente.engine.assignments.header_one' : 'routes.agente.engine.assignments.header_other';
    const header = render(tt(pluralKey, r.data.total === 1 ? '📚 {n} trabalho pendente' : '📚 {n} trabalhos pendentes'), { n: r.data.total });
    const itemTpl = tt('routes.agente.engine.assignments.item', '• {title} — {days}');
    const lines = [
      header,
      ...r.data.pendentes.slice(0, 6).map((p) =>
        render(itemTpl, {
          title: p.title,
          days:
            p.daysLeft < 0
              ? render(tt('routes.agente.engine.assignments.days_overdue', 'atrasado {n}d'), { n: Math.abs(p.daysLeft) })
              : p.daysLeft === 0
                ? tt('routes.agente.engine.assignments.days_today', 'entrega hoje')
                : render(tt('routes.agente.engine.assignments.days_left', 'faltam {n}d'), { n: p.daysLeft })
        })
      )
    ];
    if (r.data.total > 6) {
      lines.push(
        render(tt('routes.agente.engine.assignments.more', '…e mais {n}.'), { n: r.data.total - 6 })
      );
    }
    return { text: lines.join('\n'), tool: 'assignments_pending' };
  }

  // ---- Quick action: "Resumo da semana" ----
  // Agrega finanças 7d + completion hábitos 7d + assignments próximos 7d.
  if (matches(msg, ['resumo da semana', 'resumo semanal', 'minha semana', 'como foi a semana', 'weekly summary', 'this week'])) {
    const r = await toolWeeklySummary();
    if (!r.ok) return { text: tt('routes.agente.engine.weekly.error', 'Erro a agregar o resumo semanal.') };
    const d = r.data;
    const lines = [
      render(tt('routes.agente.engine.weekly.title', '🗓️ Resumo da semana ({start} → {end})'), {
        start: d.windowStart,
        end: d.windowEnd
      }),
      '',
      tt('routes.agente.engine.weekly.finance_header', '💸 Finanças (7d)'),
      render(tt('routes.agente.engine.weekly.finance_despesas', '• Despesas: {valor}'), { valor: formatEUR(d.financas.despesas) }),
      render(tt('routes.agente.engine.weekly.finance_receitas', '• Receitas: {valor}'), { valor: formatEUR(d.financas.receitas) }),
      render(tt('routes.agente.engine.weekly.finance_transacoes', '• {n} transações'), { n: d.financas.transacoes }),
      '',
      tt('routes.agente.engine.weekly.habits_header', '🌱 Hábitos (7d)'),
      d.habitos.total === 0
        ? render(tt('routes.agente.engine.weekly.habits_none', '• Sem hábitos configurados.'), {})
        : render(tt('routes.agente.engine.weekly.habits_line', '• {done} logs · {pct}% completion ({total} hábitos)'), {
            done: d.habitos.logsUltimos7d,
            pct: d.habitos.completionPct,
            total: d.habitos.total
          }),
      '',
      tt('routes.agente.engine.weekly.assignments_header', '📚 Trabalhos (próx. 7d)'),
      d.trabalhos.proximos7d === 0
        ? render(tt('routes.agente.engine.weekly.assignments_none', '• Sem entregas nesta semana.'), {})
        : render(tt('routes.agente.engine.weekly.assignments_line', '• {n} com deadline esta semana: {lista}'), {
            n: d.trabalhos.proximos7d,
            lista: d.trabalhos.titulosPreview.join(', ')
          })
    ];
    return { text: lines.join('\n'), tool: 'weekly_summary' };
  }

  // ---- Fallback ----
  return {
    text:
      tt('routes.agente.engine.fallback.intro', 'Posso ajudar com:') +
      '\n' +
      render(tt('routes.agente.engine.fallback.line_o_que_falta', '• "o que falta?" — coisas pendentes na app'), {}) +
      '\n' +
      render(tt('routes.agente.engine.fallback.line_resumo', '• "resumo financeiro" — saldo / receitas / despesas'), {}) +
      '\n' +
      render(tt('routes.agente.engine.fallback.line_habitos', '• "hábitos" — o que já marcaste hoje'), {}) +
      '\n' +
      render(tt('routes.agente.engine.fallback.line_progresso', '• "progresso" — XP, badges, quizzes'), {}) +
      '\n' +
      render(tt('routes.agente.engine.fallback.line_como_estou', '• "como estou?" — resumo geral'), {}) +
      '\n' +
      '\n' +
      tt('routes.agente.engine.fallback.cta', 'Tenta uma destas perguntas.')
  };
}