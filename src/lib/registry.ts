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

// Legacy V3 site is preserved at /legacy (iframe). Hub exposes it as a card
// so users always have a way back to the original site during the migration.
export const legacySubApp: SubApp = {
  id: 'legacy',
  name: 'Site V3',
  icon: '🐷',
  color: '#94a3b8',
  description: 'O site original (preservado)',
  route: '/legacy',
  enabled: true,
  order: 99
};

// -------------------------------------------------------------------
// V3 content routes — native SvelteKit ports of the 7 missing V3 pages.
// Each entry is rendered on the Hub via HubCard (with an optional `tagline`).
// Phase 12: these replace the iframe shell for case / course / walk / write /
// pt / dl / secrets. The legacy HTML stays at /legacy/ for archival.
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

export const v3Content: V3ContentEntry[] = [
  {
    id: 'case',
    slug: 'case',
    title: 'Case',
    icon: '📊',
    accent: '#3b82f6',
    description: 'Deep dive da Equivalenza',
    href: '/case/',
    tagline: 'Empresa, declínio, concorrente, persona'
  },
  {
    id: 'course',
    slug: 'course',
    title: 'Course',
    icon: '🎓',
    accent: '#8b5cf6',
    description: 'SWOT, TOWS, SCQA, Persona',
    href: '/course/',
    tagline: 'Teoria da aula'
  },
  {
    id: 'walk',
    slug: 'walk',
    title: 'Walkthrough',
    icon: '🎙️',
    accent: '#ec4899',
    description: '5 passos do trabalho',
    href: '/walk/',
    tagline: 'Com áudio guiado'
  },
  {
    id: 'write',
    slug: 'write',
    title: 'Writing',
    icon: '✍️',
    accent: '#10b981',
    description: 'Tips anti-AI detection',
    href: '/write/',
    tagline: 'Variação, voz, exemplos'
  },
  {
    id: 'pt',
    slug: 'pt',
    title: 'PT 🇵🇹',
    icon: '🇵🇹',
    accent: '#ef4444',
    description: 'Aulas em português',
    href: '/pt/',
    tagline: 'Teoria + mini-curso PT'
  },
  {
    id: 'secrets',
    slug: 'secrets',
    title: 'Secrets',
    icon: '🔐',
    accent: '#a855f7',
    description: '8 segredos para descobrir',
    href: '/secrets/',
    tagline: 'Easter eggs + badges'
  }
];

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
