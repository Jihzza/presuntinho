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

import {
  toolFinanceSummary,
  toolFinanceMonth,
  toolHabitsOverview,
  toolSchoolProgress,
  toolVisitedPages,
  toolProfileSummary,
  toolWhatsMissing
} from './tools';

export interface AgentReply {
  text: string;
  tool?: string;
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
  if (!msg) return { text: 'Diz-me algo 😊' };

  // ---- Greetings / small talk ----
  if (matches(msg, ['ola', 'oi', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'como estas'])) {
    return { text: 'Olá! Sou o teu agente. Posso ver o que está na app — XP, hábitos, finanças, escola. Pergunta-me o que quiseres saber.' };
  }

  // ---- "o que falta" / "what's missing" ----
  if (matches(msg, ['o que falta', 'o que me falta', 'que falta', 'pendente', 'por fazer', 'que materia falta', 'que materia', 'o que estudar'])) {
    const r = await toolWhatsMissing();
    if (!r.ok) return { text: 'Não consegui ler os dados agora. Tenta outra vez.' };
    if (r.data.pending.length === 0) {
      return { text: '🎉 Nada pendente! Estás em dia com tudo.' };
    }
    const lines = [
      'Tens ' + r.data.pending.length + ' coisa(s) pendente(s):',
      ...r.data.pending.map((p) => '• ' + p),
      '',
      'Sugestões:',
      ...r.data.suggestions.map((s) => '→ ' + s)
    ];
    return { text: lines.join('\n'), tool: 'whats_missing' };
  }

  // ---- Finanças: resumo / quanto gastei / saldo ----
  if (matches(msg, ['resumo financeiro', 'resumo financas', 'quanto gastei', 'quanto tenho', 'saldo', 'orcamento'])) {
    const r = await toolFinanceSummary();
    if (!r.ok) return { text: 'Erro a ler finanças. Tenta outra vez.' };
    const d = r.data;
    if (d.receitas === 0 && d.despesas === 0) {
      return { text: 'Ainda não tens transações este mês. Adiciona a primeira em /financas/nova.' };
    }
    return {
      text:
        `📊 Finanças de ${d.mes}\n` +
        `• Receitas: ${formatEUR(d.receitas)}\n` +
        `• Despesas: ${formatEUR(d.despesas)}\n` +
        `• Saldo: ${formatEUR(d.saldo)}\n` +
        `• Orçamentos ativos: ${d.orcamentosAtivos}`,
      tool: 'finance_summary'
    };
  }

  if (matches(msg, ['transacoes', 'lista financas', 'lista transacoes', 'movimentos'])) {
    const r = await toolFinanceMonth();
    if (!r.ok) return { text: 'Erro a ler transações.' };
    if (r.data.transacoes === 0) return { text: 'Nenhuma transação este mês.' };
    return {
      text: `📋 ${r.data.transacoes} transaç${r.data.transacoes === 1 ? 'ão' : 'ões'} em ${r.data.mes}\n• Despesa total: ${formatEUR(r.data.totalDespesa)}\n• Receita total: ${formatEUR(r.data.totalReceita)}`,
      tool: 'finance_month'
    };
  }

  // ---- Hábitos ----
  if (matches(msg, ['habitos', 'habito', 'rotina', 'streak', 'que fiz hoje', 'o que fiz hoje'])) {
    const r = await toolHabitsOverview();
    if (!r.ok) return { text: 'Erro a ler hábitos.' };
    if (r.data.totalHabitos === 0) {
      return { text: 'Ainda não tens hábitos criados. Vai a /habitos/novo criar o primeiro.' };
    }
    const lines = [
      `🌱 Hábitos: ${r.data.ativosHoje}/${r.data.totalHabitos} marcados hoje`,
      ...r.data.lista.map((h) => `${h.loggedToday ? '✅' : '⬜'} ${h.icon} ${h.name}`)
    ];
    return { text: lines.join('\n'), tool: 'habits_overview' };
  }

  // ---- Escola / progresso / xp / nivel ----
  if (matches(msg, ['progresso', 'escola', 'xp', 'nivel', 'badge', 'quiz', 'quanto xp', 'quanto ganhei'])) {
    const r = await toolSchoolProgress();
    if (!r.ok) return { text: 'Erro a ler progresso.' };
    const p = await toolProfileSummary();
    const xp = p.ok ? p.data.xp : 0;
    return {
      text:
        `🎓 Escola\n` +
        `• XP total: ${xp}\n` +
        `• Badges: ${r.data.badges}/${r.data.badgesTotal}\n` +
        `• Quizzes feitos: ${r.data.quizzesFeitos}/${r.data.quizzesTotal}`,
      tool: 'school_progress'
    };
  }

  // ---- "como estou" / "resumo geral" ----
  if (matches(msg, ['como estou', 'resumo geral', 'resumo', 'tudo', 'overview'])) {
    const prof = await toolProfileSummary();
    const fin = await toolFinanceSummary();
    const hab = await toolHabitsOverview();
    const lines = ['🌟 Resumo geral:'];
    if (prof.ok) lines.push(`• XP: ${prof.data.xp} (${prof.data.heartClicks} ❤️ clicks)`);
    if (hab.ok) lines.push(`• Hábitos hoje: ${hab.data.ativosHoje}/${hab.data.totalHabitos}`);
    if (fin.ok && (fin.data.receitas || fin.data.despesas)) {
      lines.push(`• Saldo ${fin.data.mes}: ${formatEUR(fin.data.saldo)}`);
    }
    return { text: lines.join('\n'), tool: 'profile_summary' };
  }

  // ---- Fallback ----
  return {
    text:
      'Posso ajudar com:\n' +
      '• "o que falta?" — coisas pendentes na app\n' +
      '• "resumo financeiro" — saldo / receitas / despesas\n' +
      '• "hábitos" — o que já marcaste hoje\n' +
      '• "progresso" — XP, badges, quizzes\n' +
      '• "como estou?" — resumo geral\n' +
      '\nTenta uma destas perguntas.'
  };
}