import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  let localSession: { profile: string } | null = null;
  let authSession: { user: { id: string } } | null = null;
  const authQueue: Array<{ user: { id: string } } | null> = [];
  const account = { current: null as null | { id: string; handle: string | null } };
  const clearSession = vi.fn((profile?: string) => {
    if (!profile || localSession?.profile === profile) localSession = null;
  });
  const setSession = vi.fn((profile: string) => {
    localSession = { profile };
  });
  return {
    get localSession() { return localSession; },
    set localSession(value) { localSession = value; },
    get authSession() { return authSession; },
    set authSession(value) { authSession = value; },
    authQueue,
    account,
    clearSession,
    setSession,
    registerKnownMember: vi.fn(),
    clearDrafts: vi.fn(),
    resetStores: vi.fn(),
    signOut: vi.fn(async () => {}),
    revokePush: vi.fn(async () => true),
    unsubscribePush: vi.fn(async () => true)
  };
});

vi.mock('$lib/auth/session', () => ({
  getSession: () => testState.localSession,
  clearSession: testState.clearSession,
  setSession: testState.setSession,
  registerKnownMember: testState.registerKnownMember
}));
vi.mock('$lib/chat/message-drafts', () => ({
  clearChatDraftsForAccount: testState.clearDrafts
}));
vi.mock('$lib/state/stores', () => ({ resetStores: testState.resetStores }));
vi.mock('$lib/push', () => ({
  revokeAuthenticatedPushBinding: testState.revokePush,
  unsubscribeLocalPushSubscription: testState.unsubscribePush
}));
vi.mock('./auth', () => ({
  accountsEnabled: () => true,
  getAuthSession: vi.fn(async () =>
    testState.authQueue.length ? testState.authQueue.shift()! : testState.authSession
  ),
  getMyAccount: vi.fn(async () => testState.account.current),
  signOut: testState.signOut
}));

import { bridgeSupabaseSession, signOutEverywhere } from './session-bridge';

beforeEach(() => {
  testState.localSession = null;
  testState.authSession = null;
  testState.authQueue.length = 0;
  testState.account.current = null;
  vi.clearAllMocks();
  testState.revokePush.mockResolvedValue(true);
  testState.unsubscribePush.mockResolvedValue(true);
});

describe('Supabase/local session identity bridge', () => {
  it('clears A before it binds the authenticated account B', async () => {
    testState.localSession = { profile: 'account-a' };
    testState.authSession = { user: { id: 'account-b' } };
    testState.account.current = { id: 'account-b', handle: 'b' };

    await expect(bridgeSupabaseSession()).resolves.toBe('bridged');

    expect(testState.clearDrafts).toHaveBeenCalledWith('account-a');
    expect(testState.clearSession).toHaveBeenCalled();
    expect(testState.resetStores).toHaveBeenCalled();
    expect(testState.setSession).toHaveBeenCalledWith('account-b', 'primary');
    expect(testState.clearSession.mock.invocationCallOrder[0])
      .toBeLessThan(testState.setSession.mock.invocationCallOrder[0]);
    expect(testState.localSession?.profile).toBe('account-b');
  });

  it('never binds an account row whose id differs from the auth user', async () => {
    testState.authSession = { user: { id: 'account-b' } };
    testState.account.current = { id: 'account-a', handle: 'a' };

    await expect(bridgeSupabaseSession()).resolves.toBe('needs-handle');
    expect(testState.setSession).not.toHaveBeenCalled();
    expect(testState.localSession).toBeNull();
  });

  it('abandons a stale hydration when auth changes while the row loads', async () => {
    testState.authQueue.push(
      { user: { id: 'account-a' } },
      { user: { id: 'account-b' } }
    );
    testState.account.current = { id: 'account-a', handle: 'a' };

    await expect(bridgeSupabaseSession()).resolves.toBe('no-session');
    expect(testState.setSession).not.toHaveBeenCalled();
  });

  it('reuses a local session only when it matches the auth UUID', async () => {
    testState.localSession = { profile: 'account-b' };
    testState.authSession = { user: { id: 'account-b' } };

    await expect(bridgeSupabaseSession()).resolves.toBe('bridged');
    expect(testState.setSession).not.toHaveBeenCalled();
    expect(testState.clearSession).not.toHaveBeenCalled();
  });
});

describe('ordered shared-device logout', () => {
  it('revokes the authenticated push binding before sign-out and local cleanup', async () => {
    testState.localSession = { profile: 'account-a' };
    testState.authSession = { user: { id: 'account-a' } };

    await signOutEverywhere();

    expect(testState.revokePush).toHaveBeenCalledOnce();
    expect(testState.signOut).toHaveBeenCalledOnce();
    expect(testState.revokePush.mock.invocationCallOrder[0])
      .toBeLessThan(testState.signOut.mock.invocationCallOrder[0]);
    expect(testState.signOut.mock.invocationCallOrder[0])
      .toBeLessThan(testState.clearSession.mock.invocationCallOrder[0]);
    expect(testState.unsubscribePush).not.toHaveBeenCalled();
  });

  it('unsubscribes locally before sign-out when authenticated revocation fails', async () => {
    testState.localSession = { profile: 'account-a' };
    testState.authSession = { user: { id: 'account-a' } };
    testState.revokePush.mockRejectedValueOnce(new Error('offline'));

    await signOutEverywhere();

    expect(testState.unsubscribePush).toHaveBeenCalledOnce();
    expect(testState.unsubscribePush.mock.invocationCallOrder[0])
      .toBeLessThan(testState.signOut.mock.invocationCallOrder[0]);
    expect(testState.localSession).toBeNull();
  });

  it('targets the authenticated A tombstone even when this tab has no local session', async () => {
    testState.authSession = { user: { id: 'account-a' } };

    await signOutEverywhere();

    expect(testState.clearSession).toHaveBeenCalledWith('account-a');
  });
});
