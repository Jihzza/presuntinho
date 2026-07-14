import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from './client';
import { joinRoom } from './realtime';

vi.mock('./client', () => ({ getSupabaseClient: vi.fn() }));

type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';
type Handler = {
  type: 'broadcast' | 'presence';
  event: string;
  callback: (value: { payload?: unknown }) => void;
};

class FakeHub {
  channels: FakeChannel[] = [];

  notifyPresence(event: 'sync' | 'join' | 'leave'): void {
    for (const channel of [...this.channels]) channel.emit('presence', event, {});
  }
}

class FakeChannel {
  handlers: Handler[] = [];
  tracked: Record<string, unknown> | null = null;
  trackCount = 0;
  nextTrackResult: string = 'ok';
  private statusCallback: ((status: ChannelStatus) => void) | null = null;

  constructor(
    readonly hub: FakeHub,
    readonly presenceKey: string
  ) {}

  on(
    type: 'broadcast' | 'presence',
    filter: { event: string },
    callback: (value: { payload?: unknown }) => void
  ): this {
    this.handlers.push({ type, event: filter.event, callback });
    return this;
  }

  subscribe(callback: (status: ChannelStatus) => void): this {
    this.statusCallback = callback;
    queueMicrotask(() => callback('SUBSCRIBED'));
    return this;
  }

  resubscribe(): void {
    this.statusCallback?.('SUBSCRIBED');
  }

  async track(payload: Record<string, unknown>): Promise<string> {
    this.trackCount += 1;
    const result = this.nextTrackResult;
    this.nextTrackResult = 'ok';
    if (result !== 'ok') return result;
    this.tracked = payload;
    this.hub.notifyPresence('join');
    this.hub.notifyPresence('sync');
    return 'ok';
  }

  async untrack(): Promise<string> {
    const wasTracked = this.tracked !== null;
    this.tracked = null;
    if (wasTracked) this.hub.notifyPresence('leave');
    return 'ok';
  }

  presenceState<T>(): Record<string, T[]> {
    return Object.fromEntries(
      this.hub.channels
        .filter((channel) => channel.tracked)
        .map((channel) => [channel.presenceKey, [channel.tracked as T]])
    );
  }

  async send(message: { type: string; event: string; payload: unknown }): Promise<string> {
    if (message.type !== 'broadcast') return 'ok';
    for (const channel of [...this.hub.channels]) {
      if (channel === this) continue;
      channel.emit('broadcast', message.event, { payload: message.payload });
    }
    return 'ok';
  }

  emit(type: 'broadcast' | 'presence', event: string, value: { payload?: unknown }): void {
    for (const handler of [...this.handlers]) {
      if (handler.type === type && handler.event === event) handler.callback(value);
    }
  }
}

class FakeSupabase {
  hubs = new Map<string, FakeHub>();
  channels: FakeChannel[] = [];
  nextTrackResult = 'ok';

  channel(topic: string, options: { config: { presence: { key: string } } }): FakeChannel {
    let hub = this.hubs.get(topic);
    if (!hub) this.hubs.set(topic, (hub = new FakeHub()));
    const channel = new FakeChannel(hub, options.config.presence.key);
    channel.nextTrackResult = this.nextTrackResult;
    this.nextTrackResult = 'ok';
    hub.channels.push(channel);
    this.channels.push(channel);
    return channel;
  }

  async removeChannel(channel: FakeChannel): Promise<string> {
    await channel.untrack();
    channel.hub.channels = channel.hub.channels.filter((item) => item !== channel);
    return 'ok';
  }
}

const hostMeta = { role: 'host' as const, name: 'Host', mascot: 'ham' };
const guestMeta = { role: 'guest' as const, name: 'Guest', mascot: 'ham' };

describe('realtime multiplayer room', () => {
  let client: FakeSupabase;

  beforeEach(() => {
    client = new FakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(client as never);
  });

  it('assigns one sticky guest and rejects a third participant', async () => {
    const host = await joinRoom('ABCD23', hostMeta);
    const firstGuest = await joinRoom('ABCD23', guestMeta);
    expect(host.peerPresent()).toBe(true);
    expect(firstGuest.peerPresent()).toBe(true);

    let turn: unknown;
    host.on('turn', (payload) => (turn = payload));
    firstGuest.send('turn', { dir: 'up' });
    expect(turn).toEqual({ dir: 'up' });

    const lateGuest = await joinRoom('ABCD23', { ...guestMeta, name: 'Late' });
    let conflict: string | null = null;
    lateGuest.onConflict?.((reason) => (conflict = reason));
    expect(conflict).toBe('role_taken');
    expect(firstGuest.peerPresent()).toBe(true);

    await lateGuest.leave();
    await firstGuest.leave();
    await host.leave();
  });

  it('re-tracks presence whenever the channel subscribes again', async () => {
    const room = await joinRoom('ABCD23', hostMeta);
    const channel = client.channels[0];
    expect(channel.trackCount).toBe(1);
    channel.resubscribe();
    await Promise.resolve();
    await Promise.resolve();
    expect(channel.trackCount).toBe(2);
    await room.leave();
  });

  it('rejects the initial join when presence tracking fails', async () => {
    client.nextTrackResult = 'timed out';
    await expect(joinRoom('ABCD23', hostMeta)).rejects.toThrow('presence track timed out');
  });

  it('exchanges legacy flat messages with an older guest client', async () => {
    const host = await joinRoom('ABCD23', hostMeta);
    const hub = client.hubs.get('arcade:ABCD23')!;
    const oldGuest = new FakeChannel(hub, 'guest-old');
    hub.channels.push(oldGuest);
    let oldState: unknown;
    oldGuest.on('broadcast', { event: 'g' }, ({ payload }) => (oldState = payload));
    await oldGuest.track(guestMeta);

    host.send('state', { score: 4 });
    expect(oldState).toEqual({ score: 4, t: 'state' });

    let turn: unknown;
    host.on('turn', (payload) => (turn = payload));
    await oldGuest.send({ type: 'broadcast', event: 'g', payload: { t: 'turn', dir: 'left' } });
    expect(turn).toEqual({ t: 'turn', dir: 'left' });

    await host.leave();
    await oldGuest.untrack();
  });

  it('exchanges legacy flat messages with an older host client', async () => {
    const bootstrap = client.channel('arcade:ABCD23', { config: { presence: { key: 'host-old' } } });
    let oldTurn: unknown;
    bootstrap.on('broadcast', { event: 'g' }, ({ payload }) => (oldTurn = payload));
    await bootstrap.track(hostMeta);

    const guest = await joinRoom('ABCD23', guestMeta);
    expect(guest.peerPresent()).toBe(true);
    guest.send('turn', { dir: 'right' });
    expect(oldTurn).toEqual({ dir: 'right', t: 'turn' });

    let state: unknown;
    guest.on('state', (payload) => (state = payload));
    await bootstrap.send({ type: 'broadcast', event: 'g', payload: { t: 'state', score: 7 } });
    expect(state).toEqual({ t: 'state', score: 7 });

    await guest.leave();
    await bootstrap.untrack();
  });
});
