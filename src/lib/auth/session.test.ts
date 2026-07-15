import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileId } from './hash';

const ACCOUNT_A = 'account-a' as ProfileId;
const ACCOUNT_B = 'account-b' as ProfileId;

class MemoryStorage {
  #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, String(value)); }
}

class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];
  readonly name: string;
  constructor(name: string) {
    super();
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(): void {}
  close(): void {}
  emit(data: unknown): void {
    const event = new Event('message') as Event & { data: unknown };
    Object.defineProperty(event, 'data', { value: data });
    this.dispatchEvent(event);
  }
}

beforeEach(() => {
  vi.resetModules();
  FakeBroadcastChannel.instances.length = 0;
  const windowTarget = new EventTarget() as EventTarget & {
    localStorage: MemoryStorage;
    sessionStorage: MemoryStorage;
  };
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  windowTarget.localStorage = localStorage;
  windowTarget.sessionStorage = sessionStorage;
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('sessionStorage', sessionStorage);
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  if (typeof CustomEvent === 'undefined') {
    class TestCustomEvent<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    }
    vi.stubGlobal('CustomEvent', TestCustomEvent);
  }
});

afterEach(() => vi.unstubAllGlobals());

describe('reactive local session lifecycle', () => {
  it('invalidates account A in the same tab on logout', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_A, 'primary');
    const changes: Array<{ profile: string | null; reason: string }> = [];
    const unbind = session.subscribeSessionChanges((change) => {
      changes.push({ profile: change.session?.profile ?? null, reason: change.reason });
    });

    session.clearSession();

    expect(session.getSession()).toBeNull();
    expect(changes).toContainEqual({ profile: null, reason: 'clear' });
    unbind();
  });

  it('invalidates account A when another tab publishes its logout tombstone', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_A, 'primary');
    const changes: Array<{ profile: string | null; reason: string }> = [];
    session.subscribeSessionChanges((change) => {
      changes.push({ profile: change.session?.profile ?? null, reason: change.reason });
    });
    const channel = FakeBroadcastChannel.instances[0];

    channel.emit({
      v: 1,
      id: 'remote-clear-a',
      source: 'other-tab',
      at: Date.now() + 1,
      action: 'clear',
      profile: 'account-a',
      previousProfile: 'account-a'
    });

    expect(session.getSession()).toBeNull();
    expect(changes).toContainEqual({ profile: null, reason: 'remote' });
  });

  it('switches A to B without a reload and emits the new identity', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_A, 'primary');
    const changes: string[] = [];
    session.subscribeSessionChanges((change) => {
      if (change.session) changes.push(change.session.profile);
    });

    session.setSession(ACCOUNT_B, 'primary');

    expect(session.getSession()?.profile).toBe('account-b');
    expect(sessionStorage.getItem('presuntinho-session-account-a')).toBeNull();
    expect(changes).toContain('account-b');
  });

  it('clears A when another tab switches the shared browser to B', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_A, 'primary');
    session.subscribeSessionChanges(() => {});

    FakeBroadcastChannel.instances[0].emit({
      v: 1,
      id: 'remote-switch-b',
      source: 'other-tab',
      at: Date.now() + 1,
      action: 'switch',
      profile: 'account-b',
      previousProfile: 'account-a'
    });

    expect(session.getSession()).toBeNull();
  });

  it('uses the localStorage tombstone when BroadcastChannel delivery is unavailable', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_A, 'primary');
    session.subscribeSessionChanges(() => {});
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: 'presuntinho-session-sync-v1' },
      newValue: {
        value: JSON.stringify({
          v: 1,
          id: 'storage-clear-a',
          source: 'storage-only-tab',
          at: Date.now() + 1,
          action: 'clear',
          profile: 'account-a',
          previousProfile: 'account-a'
        })
      }
    });

    window.dispatchEvent(event);

    expect(session.getSession()).toBeNull();
  });

  it('does not let an older A tombstone evict a newer B login', async () => {
    const session = await import('./session');
    session.setSession(ACCOUNT_B, 'primary');
    session.subscribeSessionChanges(() => {});
    const unlockedAt = session.getSession()!.unlockedAt;

    FakeBroadcastChannel.instances[0].emit({
      v: 1,
      id: 'stale-clear-a',
      source: 'old-tab',
      at: unlockedAt - 1,
      action: 'clear',
      profile: 'account-a',
      previousProfile: 'account-a'
    });

    expect(session.getSession()?.profile).toBe('account-b');
  });
});
