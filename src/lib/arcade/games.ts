export type ArcadeGameId = 'snake' | 'maze' | 'racing' | 'platformer' | 'breakout';

export interface ArcadeGameDefinition {
  id: ArcadeGameId;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  difficultyKey: string;
  controlsKey: string;
  href: string;
}

export const ARCADE_GAMES: ArcadeGameDefinition[] = [
  {
    id: 'snake',
    icon: '🐍',
    titleKey: 'arcade.games.snake.title',
    descriptionKey: 'arcade.games.snake.description',
    difficultyKey: 'arcade.difficulty.easy',
    controlsKey: 'arcade.games.snake.controls',
    href: '/secrets/snake/'
  },
  {
    id: 'maze',
    icon: '⭐',
    titleKey: 'arcade.games.maze.title',
    descriptionKey: 'arcade.games.maze.description',
    difficultyKey: 'arcade.difficulty.medium',
    controlsKey: 'arcade.games.maze.controls',
    href: '/secrets/maze/'
  },
  {
    id: 'racing',
    icon: '🏎️',
    titleKey: 'arcade.games.racing.title',
    descriptionKey: 'arcade.games.racing.description',
    difficultyKey: 'arcade.difficulty.medium',
    controlsKey: 'arcade.games.racing.controls',
    href: '/secrets/racing/'
  },
  {
    id: 'platformer',
    icon: '☁️',
    titleKey: 'arcade.games.platformer.title',
    descriptionKey: 'arcade.games.platformer.description',
    difficultyKey: 'arcade.difficulty.hard',
    controlsKey: 'arcade.games.platformer.controls',
    href: '/secrets/platformer/'
  },
  {
    id: 'breakout',
    icon: '💎',
    titleKey: 'arcade.games.breakout.title',
    descriptionKey: 'arcade.games.breakout.description',
    difficultyKey: 'arcade.difficulty.easy',
    controlsKey: 'arcade.games.breakout.controls',
    href: '/secrets/breakout/'
  }
];

export function getArcadeGame(id: string | undefined): ArcadeGameDefinition | undefined {
  return ARCADE_GAMES.find((game) => game.id === id);
}

export function highScoreKey(id: ArcadeGameId): string {
  return `presuntinho-arcade-high-score-${id}`;
}

export function lastScoreKey(id: ArcadeGameId): string {
  return `presuntinho-arcade-last-score-${id}`;
}

export function readArcadeScore(key: string): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(key);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function writeArcadeScore(key: string, value: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, String(Math.max(0, Math.floor(value))));
}
