// Versus netcode — host-authoritative glue between a realtime Room and the pure
// SnakeVersusSim. Exactly one peer (the HOST, player 0) runs the simulation and
// broadcasts the full board each grid tick; the GUEST (player 1) only sends its
// turn inputs and renders whatever snapshot the host sends. Because the board is
// tiny (two short snakes + one food) a full-state broadcast per ~130ms tick is
// cheap and makes desync impossible — no prediction/rollback needed for a
// 2-player grid game.

import type { Direction } from '../engine';
import type { Room } from '$lib/multiplayer/realtime';
import { SnakeVersusSim, type VersusState, type VersusEvent, type PlayerId } from './snake-versus-sim';

export interface VersusNetOptions {
  room: Room;
  cols: number;
  rows: number;
  /** Called with the authoritative board whenever it changes (both peers). */
  onState: (s: VersusState) => void;
  /** Called with this-tick events for sfx/haptics (host only — it owns the sim). */
  onEvents?: (e: VersusEvent[], selfIsHost: boolean) => void;
  /** Grid-step period in ms. */
  stepMs?: number;
}

export class VersusNet {
  private opts: VersusNetOptions;
  private room: Room;
  private isHost: boolean;
  private sim: SnakeVersusSim | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private latest: VersusState | null = null;
  private unsubs: Array<() => void> = [];
  private stepMs: number;

  constructor(opts: VersusNetOptions) {
    this.opts = opts;
    this.room = opts.room;
    this.isHost = opts.room.role === 'host';
    this.stepMs = opts.stepMs ?? 130;

    if (this.isHost) {
      // Guest turns arrive here; apply them to player 1.
      this.unsubs.push(
        this.room.on('turn', (p: { dir?: Direction }) => {
          if (p?.dir && this.sim) this.sim.setTurn(1, p.dir);
        })
      );
      // A guest that (re)joins mid-session asks for the current board.
      this.unsubs.push(
        this.room.on('hello', () => {
          if (this.sim) this.room.send('state', { s: this.sim.state() });
        })
      );
    } else {
      // Guest renders whatever the host sends.
      this.unsubs.push(
        this.room.on('state', (p: { s?: VersusState }) => {
          if (p?.s) {
            this.latest = p.s;
            this.opts.onState(p.s);
          }
        })
      );
    }
  }

  /** HOST: begin a fresh round from a seed and start broadcasting. No-op on guest. */
  start(seed: number): void {
    if (!this.isHost) {
      // Guest announces itself; the host replies with the current board. Keep
      // re-announcing until the first state lands so a dropped/late hello (or a
      // reconnect) can't leave the guest stuck on a blank board forever.
      const hello = () => this.room.send('hello', {});
      hello();
      this.timer && clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.latest) {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
        } else {
          hello();
        }
      }, 1500);
      return;
    }
    this.sim = new SnakeVersusSim(this.opts.cols, this.opts.rows, seed);
    this.pushState([]);
    this.timer && clearInterval(this.timer);
    this.timer = setInterval(() => this.hostTick(), this.stepMs);
  }

  private hostTick(): void {
    if (!this.sim) return;
    if (this.sim.finished) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    const events = this.sim.advance();
    this.pushState(events);
  }

  private pushState(events: VersusEvent[]): void {
    if (!this.sim) return;
    const s = this.sim.state();
    this.latest = s;
    this.opts.onState(s);
    this.opts.onEvents?.(events, true);
    this.room.send('state', { s });
  }

  /** Register a turn for THIS peer's snake (host = player 0, guest = player 1). */
  setLocalTurn(dir: Direction): void {
    if (this.isHost) {
      this.sim?.setTurn(0, dir);
    } else {
      this.room.send('turn', { dir });
    }
  }

  /** Which player id is the local peer? */
  get localPlayer(): PlayerId {
    return this.isHost ? 0 : 1;
  }

  get state(): VersusState | null {
    return this.latest;
  }

  /** HOST: start a rematch with a new seed. Guest requests one via 'rematch'. */
  rematch(seed: number): void {
    if (this.isHost) this.start(seed);
    else this.room.send('rematch', {});
  }

  /** HOST: wire the guest's rematch request (call once after constructing). */
  onRematchRequest(cb: () => void): void {
    if (this.isHost) this.unsubs.push(this.room.on('rematch', () => cb()));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.sim = null;
  }
}
