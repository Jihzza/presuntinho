import { describe, it, expect, beforeEach } from 'vitest';
import {
  listLockScreens,
  createLockScreen,
  updateLockScreen,
  deleteLockScreen,
  getActiveLockScreen,
  setActiveLockScreen,
  verifyLockPassphrase,
  verifyHandleUnlock,
  lockScreenHasPassphrase
} from './lockscreen';

// The test env is `node` (see vite.config.ts) — no DOM localStorage. Install a
// tiny in-memory shim before each test, the same way the module reads it at
// call time. Web Crypto (crypto.subtle) IS available in Node 22, so the PBKDF2
// hash/verify round-trip runs for real here (no mock needed).
function installLocalStorage(): void {
  const map = new Map<string, string>();
  const ls = {
    getItem: (k: string): string | null => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string): void => void map.set(k, String(v)),
    removeItem: (k: string): void => void map.delete(k),
    clear: (): void => map.clear(),
    key: (i: number): string | null => Array.from(map.keys())[i] ?? null,
    get length(): number {
      return map.size;
    }
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = ls;
}

beforeEach(() => {
  installLocalStorage();
});

describe('lockscreen module', () => {
  it('creates and lists lock screens', async () => {
    expect(listLockScreens()).toEqual([]);
    const s = await createLockScreen({ title: 'Oi amor', message: 'Diz que me amas', emoji: '💕' });
    const list = listLockScreens();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(s.id);
    expect(list[0].title).toBe('Oi amor');
    expect(list[0].message).toBe('Diz que me amas');
    expect(list[0].emoji).toBe('💕');
    // No passphrase provided → visuals-only lock screen.
    expect(lockScreenHasPassphrase(list[0])).toBe(false);
  });

  it('hashes the passphrase (PBKDF2) on create and verifies it — never plaintext', async () => {
    const s = await createLockScreen({
      title: 'T',
      message: 'M',
      emoji: '🔒',
      passphrase: 'abre-te sesamo'
    });
    const stored = listLockScreens()[0];
    expect(stored.passphraseHash).toBeTruthy();
    expect(stored.salt).toBeTruthy();
    expect(lockScreenHasPassphrase(stored)).toBe(true);
    // The plaintext passphrase must appear nowhere in what we persist.
    expect(JSON.stringify(stored)).not.toContain('abre-te sesamo');
    // Correct passphrase verifies; wrong one does not.
    expect(await verifyLockPassphrase(s.id, 'abre-te sesamo')).toBe(true);
    expect(await verifyLockPassphrase(s.id, 'errado')).toBe(false);
    // Surrounding whitespace is normalized like the account flow.
    expect(await verifyLockPassphrase(s.id, '  abre-te sesamo  ')).toBe(true);
  });

  it('a passphrase-less (or missing) lock screen never verifies a passphrase', async () => {
    const s = await createLockScreen({ title: 'T', message: 'M', emoji: '✨' });
    expect(await verifyLockPassphrase(s.id, 'anything')).toBe(false);
    expect(await verifyLockPassphrase('missing-id', 'x')).toBe(false);
  });

  it('activates ONE lock screen at a time and deactivates', async () => {
    const a = await createLockScreen({ title: 'A', message: 'ma', emoji: '💗' });
    const b = await createLockScreen({ title: 'B', message: 'mb', emoji: '💙' });
    expect(getActiveLockScreen()).toBeNull();

    setActiveLockScreen(a.id);
    expect(getActiveLockScreen()?.id).toBe(a.id);

    // Activating b replaces a — only one active id is ever stored.
    setActiveLockScreen(b.id);
    expect(getActiveLockScreen()?.id).toBe(b.id);

    // Unknown ids are ignored (can't blank the gate with a stale id).
    setActiveLockScreen('does-not-exist');
    expect(getActiveLockScreen()?.id).toBe(b.id);

    setActiveLockScreen(null);
    expect(getActiveLockScreen()).toBeNull();
  });

  it('deleting the active lock screen clears the active pointer', async () => {
    const a = await createLockScreen({ title: 'A', message: 'm', emoji: '💗', passphrase: 'p' });
    setActiveLockScreen(a.id);
    expect(getActiveLockScreen()?.id).toBe(a.id);
    deleteLockScreen(a.id);
    expect(listLockScreens()).toHaveLength(0);
    expect(getActiveLockScreen()).toBeNull();
  });

  it('the login @tag path matches an active targetHandle + passphrase', async () => {
    const s = await createLockScreen({
      title: 'Para ti',
      message: 'entra',
      emoji: '💌',
      passphrase: 'segredo',
      targetHandle: '@Daniel'
    });
    // Stored normalized.
    expect(listLockScreens()[0].targetHandle).toBe('daniel');

    // Not active yet → no match.
    expect(await verifyHandleUnlock('daniel', 'segredo')).toBeNull();

    setActiveLockScreen(s.id);
    // Handle + passphrase both correct (handle match is case/@-insensitive).
    expect((await verifyHandleUnlock('@daniel', 'segredo'))?.id).toBe(s.id);
    // Wrong passphrase → null.
    expect(await verifyHandleUnlock('daniel', 'nope')).toBeNull();
    // Wrong handle → null.
    expect(await verifyHandleUnlock('outra', 'segredo')).toBeNull();

    // updateLockScreen patches metadata immutably (id/createdAt preserved).
    const before = listLockScreens()[0];
    const patched = updateLockScreen(s.id, { title: 'Novo titulo', targetHandle: '@Fatma' });
    expect(patched?.title).toBe('Novo titulo');
    expect(patched?.targetHandle).toBe('fatma');
    expect(patched?.id).toBe(before.id);
    expect(patched?.createdAt).toBe(before.createdAt);
  });
});
