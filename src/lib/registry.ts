// Sub-app plugin registry. Adding a 6th sub-app = add an entry here + create
// the route folder. See docs/adding-a-sub-app.md.

export interface SubApp {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  route: string;
  enabled: boolean;
  order: number;
}

export const subApps: SubApp[] = [
  {
    id: 'escola',
    name: 'Escola',
    icon: '🎓',
    color: '#3b82f6',
    description: 'Cursos, lições e quizzes',
    route: '/escola',
    enabled: true,
    order: 1
  },
  {
    id: 'trabalhos',
    name: 'Trabalhos',
    icon: '📝',
    color: '#f59e0b',
    description: 'Trabalhos e entregas com prazos',
    route: '/trabalhos',
    enabled: true,
    order: 2
  },
  {
    id: 'financas',
    name: 'Finanças',
    icon: '💰',
    color: '#10b981',
    description: 'Transações, orçamento e categorias',
    route: '/financas',
    enabled: true,
    order: 3
  },
  {
    id: 'habitos',
    name: 'Hábitos',
    icon: '✅',
    color: '#8b5cf6',
    description: 'Hábitos diários com streaks',
    route: '/habitos',
    enabled: true,
    order: 4
  },
  {
    id: 'biblioteca',
    name: 'Biblioteca',
    icon: '📚',
    color: '#ec4899',
    description: 'Bookmarks, links e referências',
    route: '/biblioteca',
    enabled: true,
    order: 5
  },
  {
    id: 'humor',
    name: 'Humor',
    icon: '🩷',
    color: '#f472b6',
    description: 'Diário de sentimentos, sem julgamentos',
    route: '/humor',
    enabled: true,
    order: 6
  },
  {
    id: 'memorias',
    name: 'Memórias',
    icon: '🕰️',
    color: '#a855f7',
    description: 'Momentos guardados com carinho',
    route: '/memorias',
    enabled: true,
    order: 7
  },
  {
    id: 'vida',
    name: 'Vida',
    icon: '🌿',
    color: '#22c55e',
    description: 'O teu cantinho: escola, hábitos, humor e memórias',
    route: '/vida',
    enabled: true,
    order: 8
  }
];

// -------------------------------------------------------------------
// V3 content entry shape — still consumed as a type by HubCard for the
// optional tagline layout. The legacy Equivalenza case-study pages
// (/case, /course, /walk, /write, /pt) it once described are superseded by
// the generic multi-course Escola and are no longer surfaced on the Hub.
// -------------------------------------------------------------------
export interface V3ContentEntry {
  id: string;
  slug: string;
  title: string;
  icon: string;
  accent: string;
  description: string;
  href: string;
  tagline: string;
}

// ---------------------------------------------------------------------------
// Agent (V7+) — in-app assistant that knows the user's state.
// Hub exposes it as a card so users can find it from the Hub.
// ---------------------------------------------------------------------------
export interface AgentEntry {
  id: 'agente';
  title: string;
  icon: string;
  accent: string;
  description: string;
  href: string;
  tagline: string;
}

export const agentEntry: AgentEntry = {
  id: 'agente',
  title: 'Agente',
  icon: '💬',
  accent: '#06b6d4',
  description: 'Pergunta qualquer coisa — vê os teus hábitos, finanças e escola.',
  href: '/agente/',
  tagline: 'Assistente com memória da app'
};
