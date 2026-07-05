import type { ArcadeEngine, ControlScheme } from './engine';
import { createSnake } from './games/snake';
import { createMaze } from './games/maze';
import { createRacing } from './games/racing';
import { createPlatformer } from './games/platformer';
import { createBreakout } from './games/breakout';
import { createPong } from './games/pong';

export type ArcadeGameId = 'snake' | 'maze' | 'racing' | 'platformer' | 'breakout' | 'pong';

/** Mobile HUD layout, declared explicitly per game. The controls are split by
 *  SIDE so they're where the thumb expects them: `left` sits at the bottom-left
 *  corner, `right` at the bottom-right corner. */
export type HudLeft = 'dpad' | 'move-left' | 'move-lr' | 'none';
export type HudRight = 'move-right' | 'jump' | 'launch' | 'move-right-jump' | 'none';
export interface HudConfig {
  left: HudLeft;
  right: HudRight;
}

export interface ArcadeGameDefinition {
  id: ArcadeGameId;
  icon: string;
  /** Marquee accent colour (matches the engine's neon palette). */
  accent: string;
  /** Which on-screen control cluster this game shows. */
  control: ControlScheme;
  /** Explicit mobile-HUD configuration (overlay controls). */
  hud: HudConfig;
  /** Win by reaching a goal (won) or survive-forever (endless high score)? */
  mode: 'goal' | 'endless';
  titleKey: string;
  descriptionKey: string;
  difficultyKey: string;
  /** Per-game control hint (mobile). */
  controlsKey: string;
  /** Per-game keyboard hint (desktop panel). */
  keysKey: string;
  href: string;
  factory: () => ArcadeEngine;
}

export const ARCADE_GAMES: ArcadeGameDefinition[] = [
  {
    id: 'snake',
    icon: '🐍',
    accent: '#4ade80',
    control: 'turn',
    hud: { left: 'dpad', right: 'none' },
    mode: 'endless',
    titleKey: 'arcade.games.snake.title',
    descriptionKey: 'arcade.games.snake.description',
    difficultyKey: 'arcade.difficulty.easy',
    controlsKey: 'arcade.games.snake.controls',
    keysKey: 'arcade.games.snake.keys',
    href: '/secrets/snake/',
    factory: createSnake
  },
  {
    id: 'maze',
    icon: '⭐',
    accent: '#a78bfa',
    control: 'turn',
    hud: { left: 'dpad', right: 'none' },
    mode: 'goal',
    titleKey: 'arcade.games.maze.title',
    descriptionKey: 'arcade.games.maze.description',
    difficultyKey: 'arcade.difficulty.medium',
    controlsKey: 'arcade.games.maze.controls',
    keysKey: 'arcade.games.maze.keys',
    href: '/secrets/maze/',
    factory: createMaze
  },
  {
    id: 'racing',
    icon: '🏎️',
    accent: '#38bdf8',
    control: 'steer',
    hud: { left: 'move-left', right: 'move-right' },
    mode: 'endless',
    titleKey: 'arcade.games.racing.title',
    descriptionKey: 'arcade.games.racing.description',
    difficultyKey: 'arcade.difficulty.medium',
    controlsKey: 'arcade.games.racing.controls',
    keysKey: 'arcade.games.racing.keys',
    href: '/secrets/racing/',
    factory: createRacing
  },
  {
    id: 'platformer',
    icon: '☁️',
    accent: '#c084fc',
    control: 'jump',
    hud: { left: 'move-lr', right: 'jump' },
    mode: 'goal',
    titleKey: 'arcade.games.platformer.title',
    descriptionKey: 'arcade.games.platformer.description',
    difficultyKey: 'arcade.difficulty.hard',
    controlsKey: 'arcade.games.platformer.controls',
    keysKey: 'arcade.games.platformer.keys',
    href: '/secrets/platformer/',
    factory: createPlatformer
  },
  {
    id: 'breakout',
    icon: '💎',
    accent: '#22d3ee',
    control: 'paddle',
    hud: { left: 'move-left', right: 'move-right' },
    mode: 'goal',
    titleKey: 'arcade.games.breakout.title',
    descriptionKey: 'arcade.games.breakout.description',
    difficultyKey: 'arcade.difficulty.easy',
    controlsKey: 'arcade.games.breakout.controls',
    keysKey: 'arcade.games.breakout.keys',
    href: '/secrets/breakout/',
    factory: createBreakout
  },
  {
    id: 'pong',
    icon: '🏓',
    accent: '#f472b6',
    control: 'paddle',
    hud: { left: 'move-left', right: 'move-right' },
    mode: 'goal',
    titleKey: 'arcade.games.pong.title',
    descriptionKey: 'arcade.games.pong.description',
    difficultyKey: 'arcade.difficulty.medium',
    controlsKey: 'arcade.games.pong.controls',
    keysKey: 'arcade.games.pong.keys',
    href: '/secrets/pong/',
    factory: createPong
  }
];

export function getArcadeGame(id: string | undefined): ArcadeGameDefinition | undefined {
  return ARCADE_GAMES.find((game) => game.id === id);
}

// ── local high-score persistence (unchanged storage keys) ────────────────────

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
