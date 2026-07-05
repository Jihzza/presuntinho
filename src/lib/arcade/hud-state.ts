// Shared arcade HUD channel. While a game is actively playing, ArcadeGame
// publishes its control config + input callbacks here; the ROOT layout renders
// the touch HUD fixed to the viewport bottom corners (where the mascot + heart
// FABs normally sit) and hides those FABs. Rendering at the layout level — not
// inside the game page — guarantees the controls are anchored to the screen
// edge over the footer, exactly like the app's own floating buttons.
import { writable } from 'svelte/store';
import type { Direction } from './engine';
import type { HudAction, HudMove } from './games';

export interface ArcadeHudState {
  move: HudMove;
  action: HudAction;
  onTurn: (dir: Direction) => void;
  onHold: (dir: Direction, down: boolean) => void;
  onAction: (down: boolean) => void;
}

/** null = no game playing → normal FABs shown, no touch HUD. */
export const arcadeHud = writable<ArcadeHudState | null>(null);
