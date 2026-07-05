import { writable } from 'svelte/store';

/**
 * True while a fullscreen arcade SURFACE (the lobby attract screen) is mounted.
 * Separate from `arcadeHud` (which also carries game-input callbacks) so a route
 * can request the whole screen without pretending a game is playing. The root
 * layout ORs this into the same `.arcade-immersive` class that hides the app
 * chrome, so the lobby gets true fullscreen with zero game coupling.
 */
export const arcadeImmersive = writable(false);
