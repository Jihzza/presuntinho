import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => {
  let listener: ((user: { id: string } | null) => void) | null = null;
  const accountResults: Array<Promise<unknown>> = [];
  const userA = { id: 'auth-a' };
  return {
    userA,
    accountResults,
    emit(user: { id: string } | null) { listener?.(user); },
    mock: {
      accountsEnabled: () => true,
      getAuthUser: async () => userA,
      getMyAccount: () => accountResults.shift() ?? Promise.resolve(null),
      onAuthChange: (callback: (user: { id: string } | null) => void) => {
        listener = callback;
        return () => { listener = null; };
      }
    }
  };
});

vi.mock('./auth', () => auth.mock);

import { accountState, startAccountSync, stopAccountSync } from './account-store.svelte';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  stopAccountSync();
  accountState.user = null;
  accountState.account = null;
  accountState.ready = false;
  auth.accountResults.length = 0;
});

describe('account sync publication epoch', () => {
  it('cannot publish account A after a newer B hydration or publish B after logout', async () => {
    const initial = { id: 'account-initial', handle: 'initial' };
    auth.accountResults.push(Promise.resolve(initial));
    await startAccountSync();
    expect(accountState.account).toBe(initial);

    const staleA = deferred<{ id: string; handle: string }>();
    const currentB = deferred<{ id: string; handle: string }>();
    auth.accountResults.push(staleA.promise, currentB.promise);
    auth.emit(auth.userA);
    auth.emit({ id: 'auth-b' });

    const accountB = { id: 'account-b', handle: 'b' };
    currentB.resolve(accountB);
    await vi.waitFor(() => expect(accountState.account).toBe(accountB));

    staleA.resolve({ id: 'account-a', handle: 'a' });
    await Promise.resolve();
    await Promise.resolve();
    expect(accountState.account).toBe(accountB);
    expect(accountState.user?.id).toBe('auth-b');

    const staleAfterLogout = deferred<{ id: string; handle: string }>();
    auth.accountResults.push(staleAfterLogout.promise);
    auth.emit({ id: 'auth-b' });
    auth.emit(null);
    staleAfterLogout.resolve({ id: 'account-b-late', handle: 'late-b' });
    await Promise.resolve();
    await Promise.resolve();
    expect(accountState.user).toBeNull();
    expect(accountState.account).toBeNull();
  });
});
