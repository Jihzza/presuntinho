// Sub-app plugin registry. Adding a 6th sub-app = add an entry here + create
// the route folder. See docs/adding-a-sub-app.md (TODO: write in Phase 10).

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