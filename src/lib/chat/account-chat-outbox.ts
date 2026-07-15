/**
 * Durable, account-scoped chat work that has not been confirmed by Supabase.
 *
 * This database is intentionally separate from the profile/game Dexie schema:
 * pending messages can contain large Blobs and must be available before the
 * rest of the app stores have hydrated. IndexedDB stores Blobs without the
 * base64 expansion/localStorage limits.
 *
 * Browser storage is best-effort. Private browsing, disabled site storage,
 * quota pressure or browser eviction can make a write fail; callers must only
 * describe a message as "queued" after `putOutbox` resolves.
 */

export const ACCOUNT_CHAT_OUTBOX_DB = 'presuntinho-account-chat-v1';
export const ACCOUNT_CHAT_MAX_PENDING = 100;
export const ACCOUNT_CHAT_MAX_PENDING_BYTES = 75 * 1024 * 1024;
export const ACCOUNT_CHAT_MAX_BLOB_BYTES = 25 * 1024 * 1024;
export const ACCOUNT_CHAT_MAX_VOICE_DRAFTS = 20;
export const ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const VOICE_DRAFT_STORE = 'voice_drafts';
const MAX_TEXT_LENGTH = 4_000;
const MAX_ID_LENGTH = 180;
const MAX_NAME_LENGTH = 240;
const MAX_PATH_LENGTH = 800;

export type AccountChatOutboxState = 'queued' | 'failed';
export type AccountChatOutboxKind = 'text' | 'media';

export interface AccountChatOutboxEntry {
  key: string;
  accountId: string;
  conversationId: string;
  clientId: string;
  /** Deterministic local thread descriptor used before ensure_chat_conversation can reach the network. */
  targetKey?: string;
  kind: AccountChatOutboxKind;
  text?: string;
  replyToId?: string;
  mediaBlob?: Blob;
  mediaName?: string;
  mediaType?: string;
  mediaSize?: number;
  mediaBucket?: string;
  mediaPath?: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt?: number;
  /** Once true, orphan cleanup must first reconcile the durable message row. */
  insertAttempted?: boolean;
  state: AccountChatOutboxState;
  lastError?: string;
}

export interface AccountChatVoiceDraft {
  key: string;
  accountId: string;
  conversationId: string;
  blob: Blob;
  fileName: string;
  durationMs: number;
  replyToId?: string;
  updatedAt: number;
}

export interface AccountChatPersistence {
  putOutbox(entry: AccountChatOutboxEntry): Promise<void>;
  listOutbox(accountId: string, conversationId?: string): Promise<AccountChatOutboxEntry[]>;
  deleteOutbox(key: string): Promise<void>;
  putVoiceDraft(draft: AccountChatVoiceDraft): Promise<void>;
  getVoiceDraft(accountId: string, conversationId: string): Promise<AccountChatVoiceDraft | null>;
  deleteVoiceDraft(accountId: string, conversationId: string): Promise<void>;
  /** Privacy boundary used on explicit logout/account switch. */
  purgeAccount(accountId: string): Promise<void>;
  /** Remove stale rows owned by any account other than the active one. */
  purgeAccountsExcept(accountId: string): Promise<void>;
  /** Logged-out startup cleanup, including malformed rows with no owner. */
  purgeAll(): Promise<void>;
}

export type AccountChatStorageErrorCode = 'unavailable' | 'quota' | 'limit' | 'corrupt' | 'storage';

export class AccountChatStorageError extends Error {
  constructor(readonly code: AccountChatStorageErrorCode, message: string = code, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AccountChatStorageError';
  }
}

function validString(value: unknown, maxLength = MAX_ID_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function safeTime(value: unknown): number | null {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? time : null;
}

function safeBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function storageCause(error: unknown): AccountChatStorageError {
  if (error instanceof AccountChatStorageError) return error;
  const name = error && typeof error === 'object' ? String((error as { name?: unknown }).name ?? '') : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new AccountChatStorageError('quota', 'IndexedDB quota exceeded', { cause: error });
  }
  return new AccountChatStorageError('storage', 'IndexedDB operation failed', { cause: error });
}

export function accountChatOutboxKey(accountId: string, conversationId: string, clientId: string): string {
  return `${accountId}:${conversationId}:${clientId}`;
}

export function accountChatVoiceDraftKey(accountId: string, conversationId: string): string {
  return `${accountId}:${conversationId}`;
}

export function accountChatVoiceDraftExpired(
  draft: Pick<AccountChatVoiceDraft, 'updatedAt'>,
  now = Date.now()
): boolean {
  return draft.updatedAt < now - ACCOUNT_CHAT_VOICE_DRAFT_TTL_MS;
}

export function accountChatTargetKey(input: {
  accountId: string;
  peerId: string;
  kind: 'couple' | 'direct';
  spaceId?: string | null;
  topic: string;
}): string {
  return [input.kind, input.accountId, input.peerId, input.spaceId ?? '-', input.topic]
    .map((part) => encodeURIComponent(part))
    .join('|');
}

export function accountChatEntryBytes(entry: Pick<AccountChatOutboxEntry, 'text' | 'mediaBlob' | 'mediaSize'>): number {
  const textBytes = (entry.text?.length ?? 0) * 2;
  const blobBytes = entry.mediaBlob?.size ?? entry.mediaSize ?? 0;
  return Math.max(0, textBytes + blobBytes);
}

/** Reject malformed/corrupt rows before they can be replayed as authenticated writes. */
export function normalizeAccountChatOutboxEntry(value: unknown): AccountChatOutboxEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !validString(row.accountId) ||
    !validString(row.conversationId) ||
    !validString(row.clientId) ||
    !validString(row.key, MAX_ID_LENGTH * 3 + 2) ||
    row.key !== accountChatOutboxKey(row.accountId, row.conversationId, row.clientId)
  ) return null;
  const createdAt = safeTime(row.createdAt);
  const updatedAt = safeTime(row.updatedAt);
  const attempts = safeTime(row.attempts);
  const nextAttemptAt = row.nextAttemptAt === undefined ? 0 : safeTime(row.nextAttemptAt);
  const state = row.state === 'failed' ? 'failed' : row.state === 'queued' ? 'queued' : null;
  if (createdAt === null || updatedAt === null || attempts === null || nextAttemptAt === null || !state) return null;

  if (row.kind === 'text') {
    if (!validString(row.text, MAX_TEXT_LENGTH) || !String(row.text).trim()) return null;
    return {
      key: row.key,
      accountId: row.accountId,
      conversationId: row.conversationId,
      clientId: row.clientId,
      targetKey: validString(row.targetKey, 800) ? row.targetKey : undefined,
      kind: 'text',
      text: String(row.text).slice(0, MAX_TEXT_LENGTH),
      replyToId: validString(row.replyToId) ? row.replyToId : undefined,
      createdAt,
      updatedAt,
      attempts: Math.floor(attempts),
      nextAttemptAt,
      insertAttempted: row.insertAttempted === true,
      state,
      lastError: validString(row.lastError, 120) ? row.lastError : undefined
    };
  }

  if (row.kind !== 'media' || !safeBlob(row.mediaBlob)) return null;
  if (row.mediaBlob.size <= 0 || row.mediaBlob.size > ACCOUNT_CHAT_MAX_BLOB_BYTES) return null;
  if (!validString(row.mediaName, MAX_NAME_LENGTH)) return null;
  const storedMediaSize = safeTime(row.mediaSize);
  return {
    key: row.key,
    accountId: row.accountId,
    conversationId: row.conversationId,
    clientId: row.clientId,
    targetKey: validString(row.targetKey, 800) ? row.targetKey : undefined,
    kind: 'media',
    replyToId: validString(row.replyToId) ? row.replyToId : undefined,
    mediaBlob: row.mediaBlob,
    mediaName: row.mediaName,
    mediaType: typeof row.mediaType === 'string' ? row.mediaType.slice(0, 160) : row.mediaBlob.type,
    // After image compression this is the uploaded object's size, while the
    // original Blob is deliberately retained so a pre-upload crash can retry.
    mediaSize: storedMediaSize === null ? row.mediaBlob.size : storedMediaSize,
    mediaBucket: validString(row.mediaBucket, 120) ? row.mediaBucket : undefined,
    mediaPath: validString(row.mediaPath, MAX_PATH_LENGTH) ? row.mediaPath : undefined,
    createdAt,
    updatedAt,
    attempts: Math.floor(attempts),
    nextAttemptAt,
    insertAttempted: row.insertAttempted === true,
    state,
    lastError: validString(row.lastError, 120) ? row.lastError : undefined
  };
}

export function normalizeAccountChatVoiceDraft(value: unknown): AccountChatVoiceDraft | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !validString(row.accountId) ||
    !validString(row.conversationId) ||
    row.key !== accountChatVoiceDraftKey(row.accountId, row.conversationId) ||
    !safeBlob(row.blob) ||
    row.blob.size <= 0 ||
    row.blob.size > ACCOUNT_CHAT_MAX_BLOB_BYTES ||
    !validString(row.fileName, MAX_NAME_LENGTH)
  ) return null;
  const durationMs = safeTime(row.durationMs);
  const updatedAt = safeTime(row.updatedAt);
  if (durationMs === null || updatedAt === null) return null;
  return {
    key: String(row.key),
    accountId: row.accountId,
    conversationId: row.conversationId,
    blob: row.blob,
    fileName: row.fileName,
    durationMs,
    replyToId: validString(row.replyToId) ? row.replyToId : undefined,
    updatedAt
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb_request_failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb_transaction_aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb_transaction_failed'));
  });
}

class BrowserAccountChatPersistence implements AccountChatPersistence {
  #dbPromise: Promise<IDBDatabase> | null = null;

  #database(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new AccountChatStorageError('unavailable', 'IndexedDB is unavailable'));
    }
    if (this.#dbPromise) return this.#dbPromise;
    this.#dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(ACCOUNT_CHAT_OUTBOX_DB, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          const store = database.createObjectStore(OUTBOX_STORE, { keyPath: 'key' });
          store.createIndex('by_account', 'accountId', { unique: false });
          store.createIndex('by_scope', ['accountId', 'conversationId'], { unique: false });
        }
        if (!database.objectStoreNames.contains(VOICE_DRAFT_STORE)) {
          const store = database.createObjectStore(VOICE_DRAFT_STORE, { keyPath: 'key' });
          store.createIndex('by_account', 'accountId', { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.#dbPromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        this.#dbPromise = null;
        reject(storageCause(request.error));
      };
      request.onblocked = () => {
        this.#dbPromise = null;
        reject(new AccountChatStorageError('storage', 'IndexedDB upgrade is blocked'));
      };
    });
    return this.#dbPromise;
  }

  async putOutbox(value: AccountChatOutboxEntry): Promise<void> {
    const entry = normalizeAccountChatOutboxEntry(value);
    if (!entry) throw new AccountChatStorageError('corrupt', 'Invalid chat outbox entry');
    const database = await this.#database();
    const transaction = database.transaction([OUTBOX_STORE, VOICE_DRAFT_STORE], 'readwrite');
    const done = transactionDone(transaction);
    try {
      const store = transaction.objectStore(OUTBOX_STORE);
      const voiceStore = transaction.objectStore(VOICE_DRAFT_STORE);
      const [rawRows, rawDrafts] = await Promise.all([
        requestResult(store.index('by_account').getAll(entry.accountId)),
        requestResult(voiceStore.index('by_account').getAll(entry.accountId))
      ]);
      const rows = rawRows
        .map(normalizeAccountChatOutboxEntry)
        .filter((row): row is AccountChatOutboxEntry => Boolean(row));
      const drafts = rawDrafts
        .map(normalizeAccountChatVoiceDraft)
        .filter((row): row is AccountChatVoiceDraft => Boolean(row));
      for (const stale of drafts.filter((row) => accountChatVoiceDraftExpired(row))) {
        await requestResult(voiceStore.delete(stale.key));
      }
      const draftBytes = drafts
        .filter((row) => !accountChatVoiceDraftExpired(row))
        .reduce((total, row) => total + row.blob.size, 0);
      const previous = rows.find((row) => row.key === entry.key);
      const nextCount = rows.length + (previous ? 0 : 1);
      const nextBytes = rows.reduce((total, row) => total + accountChatEntryBytes(row), 0)
        - (previous ? accountChatEntryBytes(previous) : 0)
        + accountChatEntryBytes(entry);
      if (nextCount > ACCOUNT_CHAT_MAX_PENDING || nextBytes + draftBytes > ACCOUNT_CHAT_MAX_PENDING_BYTES) {
        transaction.abort();
        throw new AccountChatStorageError('limit', 'Chat outbox safety limit reached');
      }
      await requestResult(store.put(entry));
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      // Consume the aborted transaction rejection when validation failed.
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async listOutbox(accountId: string, conversationId?: string): Promise<AccountChatOutboxEntry[]> {
    if (!validString(accountId) || (conversationId !== undefined && !validString(conversationId))) return [];
    const database = await this.#database();
    const transaction = database.transaction(OUTBOX_STORE, 'readonly');
    const done = transactionDone(transaction);
    try {
      const index = transaction.objectStore(OUTBOX_STORE).index(conversationId ? 'by_scope' : 'by_account');
      const query = conversationId ? [accountId, conversationId] : accountId;
      const raw = await requestResult(index.getAll(query));
      await done;
      return raw
        .map(normalizeAccountChatOutboxEntry)
        .filter((row): row is AccountChatOutboxEntry => Boolean(row))
        .sort((a, b) => a.createdAt - b.createdAt || a.clientId.localeCompare(b.clientId));
    } catch (error) {
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async deleteOutbox(key: string): Promise<void> {
    if (!validString(key, MAX_ID_LENGTH * 3 + 2)) return;
    const database = await this.#database();
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      await requestResult(transaction.objectStore(OUTBOX_STORE).delete(key));
      await done;
    } catch (error) {
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async putVoiceDraft(value: AccountChatVoiceDraft): Promise<void> {
    const draft = normalizeAccountChatVoiceDraft(value);
    if (!draft) throw new AccountChatStorageError('corrupt', 'Invalid voice draft');
    const database = await this.#database();
    const transaction = database.transaction([VOICE_DRAFT_STORE, OUTBOX_STORE], 'readwrite');
    const done = transactionDone(transaction);
    try {
      const voiceStore = transaction.objectStore(VOICE_DRAFT_STORE);
      const outboxStore = transaction.objectStore(OUTBOX_STORE);
      const [rawDrafts, rawOutbox] = await Promise.all([
        requestResult(voiceStore.index('by_account').getAll(draft.accountId)),
        requestResult(outboxStore.index('by_account').getAll(draft.accountId))
      ]);
      const drafts = rawDrafts
        .map(normalizeAccountChatVoiceDraft)
        .filter((row): row is AccountChatVoiceDraft => Boolean(row));
      for (const stale of drafts.filter((row) => accountChatVoiceDraftExpired(row))) {
        await requestResult(voiceStore.delete(stale.key));
      }
      const activeDrafts = drafts.filter((row) => !accountChatVoiceDraftExpired(row) && row.key !== draft.key);
      const outbox = rawOutbox
        .map(normalizeAccountChatOutboxEntry)
        .filter((row): row is AccountChatOutboxEntry => Boolean(row));
      const combinedBytes = activeDrafts.reduce((total, row) => total + row.blob.size, draft.blob.size)
        + outbox.reduce((total, row) => total + accountChatEntryBytes(row), 0);
      if (
        activeDrafts.length + 1 > ACCOUNT_CHAT_MAX_VOICE_DRAFTS ||
        combinedBytes > ACCOUNT_CHAT_MAX_PENDING_BYTES
      ) {
        transaction.abort();
        throw new AccountChatStorageError('limit', 'Chat draft safety limit reached');
      }
      await requestResult(voiceStore.put(draft));
      await done;
    } catch (error) {
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async getVoiceDraft(accountId: string, conversationId: string): Promise<AccountChatVoiceDraft | null> {
    if (!validString(accountId) || !validString(conversationId)) return null;
    const database = await this.#database();
    const transaction = database.transaction(VOICE_DRAFT_STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      const raw = await requestResult(transaction.objectStore(VOICE_DRAFT_STORE).get(
        accountChatVoiceDraftKey(accountId, conversationId)
      ));
      const draft = normalizeAccountChatVoiceDraft(raw);
      if (draft && accountChatVoiceDraftExpired(draft)) {
        await requestResult(transaction.objectStore(VOICE_DRAFT_STORE).delete(draft.key));
        await done;
        return null;
      }
      await done;
      return draft;
    } catch (error) {
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async deleteVoiceDraft(accountId: string, conversationId: string): Promise<void> {
    if (!validString(accountId) || !validString(conversationId)) return;
    const database = await this.#database();
    const transaction = database.transaction(VOICE_DRAFT_STORE, 'readwrite');
    const done = transactionDone(transaction);
    try {
      await requestResult(transaction.objectStore(VOICE_DRAFT_STORE).delete(
        accountChatVoiceDraftKey(accountId, conversationId)
      ));
      await done;
    } catch (error) {
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async purgeAccount(accountId: string): Promise<void> {
    if (!validString(accountId)) return;
    const database = await this.#database();
    const transaction = database.transaction([OUTBOX_STORE, VOICE_DRAFT_STORE], 'readwrite');
    const done = transactionDone(transaction);
    try {
      for (const storeName of [OUTBOX_STORE, VOICE_DRAFT_STORE]) {
        const store = transaction.objectStore(storeName);
        const keys = await requestResult(store.index('by_account').getAllKeys(accountId));
        for (const key of keys) await requestResult(store.delete(key));
      }
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async purgeAccountsExcept(accountId: string): Promise<void> {
    if (!validString(accountId)) return;
    const database = await this.#database();
    const transaction = database.transaction([OUTBOX_STORE, VOICE_DRAFT_STORE], 'readwrite');
    const done = transactionDone(transaction);
    try {
      for (const storeName of [OUTBOX_STORE, VOICE_DRAFT_STORE]) {
        const store = transaction.objectStore(storeName);
        const [keys, rows] = await Promise.all([
          requestResult(store.getAllKeys()),
          requestResult(store.getAll())
        ]);
        for (let index = 0; index < keys.length; index += 1) {
          const row = rows[index] as { accountId?: unknown } | undefined;
          // Malformed/unowned rows cannot survive an identity transition and
          // later be replayed under an unrelated account.
          if (row?.accountId !== accountId) await requestResult(store.delete(keys[index]));
        }
      }
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }

  async purgeAll(): Promise<void> {
    const database = await this.#database();
    const transaction = database.transaction([OUTBOX_STORE, VOICE_DRAFT_STORE], 'readwrite');
    const done = transactionDone(transaction);
    try {
      await Promise.all([
        requestResult(transaction.objectStore(OUTBOX_STORE).clear()),
        requestResult(transaction.objectStore(VOICE_DRAFT_STORE).clear())
      ]);
      await done;
    } catch (error) {
      try { transaction.abort(); } catch { /* already completed */ }
      void done.catch(() => undefined);
      throw storageCause(error);
    }
  }
}

let browserPersistence: AccountChatPersistence | null = null;

export function getAccountChatPersistence(): AccountChatPersistence {
  browserPersistence ??= new BrowserAccountChatPersistence();
  return browserPersistence;
}

export async function purgeAccountChatAccount(accountId: string): Promise<void> {
  await getAccountChatPersistence().purgeAccount(accountId);
}

export async function purgeOtherAccountChatAccounts(accountId: string): Promise<void> {
  await getAccountChatPersistence().purgeAccountsExcept(accountId);
}

export async function purgeAllAccountChatData(): Promise<void> {
  await getAccountChatPersistence().purgeAll();
}
