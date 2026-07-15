// @ts-nocheck -- the production function is plain Lambda JS outside tsconfig;
// load it opaquely so Svelte's checker does not reinterpret the whole legacy
// file under strict TypeScript rules merely because this runtime test exists.
import { beforeAll, describe, expect, it } from 'vitest';

let commitCoupleMeta;
let commitReadMeta;
let isAllowedOrigin;

beforeAll(async () => {
  const moduleUrl = new URL('../../../netlify/functions/chat.js', import.meta.url).href;
  ({ commitCoupleMeta, commitReadMeta, isAllowedOrigin } = await import(/* @vite-ignore */ moduleUrl));
});

function baseMeta() {
  return {
    latestTs: 10,
    lastRead: { fatma: 0, daniel: 0 },
    couple: {
      points: { fatma: 1, daniel: 2 },
      scores: {},
      pings: { fatma: null, daniel: null },
    },
  };
}

function casStore(initial, options = {}) {
  let value = structuredClone(initial);
  let version = 1;
  let injected = false;
  const writes = [];
  return {
    writes,
    value: () => structuredClone(value),
    async getWithMetadata() {
      return { data: structuredClone(value), etag: `v${version}` };
    },
    async setJSON(_key, next, conditions) {
      writes.push(conditions);
      if (options.alwaysConflict) return { modified: false };
      if (!injected && options.onFirstWrite) {
        injected = true;
        value = options.onFirstWrite(structuredClone(value));
        version += 1;
        return { modified: false };
      }
      if (conditions?.onlyIfMatch !== `v${version}`) return { modified: false };
      value = structuredClone(next);
      version += 1;
      return { modified: true, etag: `v${version}` };
    },
  };
}

describe('legacy chat production origin', () => {
  it('accepts the canonical presuntinho.love production origin', () => {
    expect(isAllowedOrigin({ headers: { origin: 'https://presuntinho.love' } })).toBe(true);
    expect(isAllowedOrigin({ headers: { origin: 'https://lookalike.example' } })).toBe(false);
  });
});

describe('legacy chat meta CAS', () => {
  it('retries mark-read against fresh meta and preserves a concurrent couple update', async () => {
    const store = casStore(baseMeta(), {
      onFirstWrite(current) {
        current.couple.points.daniel = 9;
        current.lastRead.daniel = 77;
        return current;
      },
    });

    const outcome = await commitReadMeta(store, 'fatma', 50);

    expect(outcome.error).toBeUndefined();
    expect(outcome.meta.lastRead).toEqual({ fatma: 50, daniel: 77 });
    expect(outcome.meta.couple.points.daniel).toBe(9);
    expect(store.value()).toEqual(outcome.meta);
    expect(store.writes).toHaveLength(2);
  });

  it('never regresses an already newer read cursor', async () => {
    const initial = baseMeta();
    initial.lastRead.fatma = 100;
    const store = casStore(initial);

    const outcome = await commitReadMeta(store, 'fatma', 50);

    expect(outcome.meta.lastRead.fatma).toBe(100);
    expect(store.writes).toHaveLength(0);
  });

  it('returns explicit contention instead of an unconditional lost-update write', async () => {
    const store = casStore(baseMeta(), { alwaysConflict: true });

    const outcome = await commitCoupleMeta(store, (meta) => {
      meta.couple.points.fatma += 1;
      return null;
    });

    expect(outcome).toEqual({ error: 'meta_contention', contention: true });
    expect(store.writes).toHaveLength(6);
    expect(store.writes.every((conditions) => Boolean(conditions?.onlyIfMatch))).toBe(true);
  });

  it('re-applies a couple mutation to the fresh snapshot after a conflict', async () => {
    const store = casStore(baseMeta(), {
      onFirstWrite(current) {
        current.lastRead.daniel = 88;
        current.couple.points.daniel += 5;
        return current;
      },
    });

    const outcome = await commitCoupleMeta(store, (meta) => {
      meta.couple.points.fatma += 3;
      return null;
    });

    expect(outcome.meta.couple.points).toEqual({ fatma: 4, daniel: 7 });
    expect(outcome.meta.lastRead.daniel).toBe(88);
  });
});
