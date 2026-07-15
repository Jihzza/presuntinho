// src/lib/chat/client.ts
//
// Client for the private fatma↔daniel chat (netlify/functions/chat.js).
//
// - The personal access token lives in localStorage under
//   'presuntinho-chat-token-<profile>' and is attached to every request as
//   the `x-chat-token` header. It is handed out out-of-band.
// - Images are canvas-downscaled to max 1280px JPEG (~0.8 quality) before
//   being base64'd, so a phone photo comfortably fits the 3MB server cap.
// - Sends that fail for connectivity reasons are queued in a localStorage
//   outbox and flushed when connectivity returns (see flushOutbox()).

export type ChatProfile = 'fatma' | 'daniel';

export interface ChatMessage {
  id: string;
  /** Stable sender-generated identity used to reconcile retries. */
  clientId?: string;
  from: ChatProfile;
  text?: string;
  mediaKey?: string;
  mediaType?: string;
  name?: string;
  conversationId?: string;
  ts: number;
}

export interface ChatMeta {
  latestTs: number;
  lastRead: Record<ChatProfile, number>;
}

export interface ChatSince {
  messages: ChatMessage[];
  meta: ChatMeta;
}

export interface OutboxItem {
  localId: string;
  kind: 'text' | 'media';
  text?: string;
  media?: string; // dataURL (already downscaled)
  name?: string;
  mediaType?: string;
  conversationId?: string;
  queuedAt: number;
}

const BASE = '/.netlify/functions/chat';
const TOKEN_KEY_PREFIX = 'presuntinho-chat-token';
const OUTBOX_KEY_PREFIX = 'presuntinho-chat-outbox';
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.8;
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
// localStorage is precious — refuse to queue more than ~3.5MB of outbox.
const MAX_OUTBOX_CHARS = 3.5 * 1024 * 1024;

export class ChatApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(`chat api ${status}: ${code}`);
    this.name = 'ChatApiError';
    this.status = status;
    this.code = code;
  }
}

export function otherProfile(profile: ChatProfile): ChatProfile {
  return profile === 'fatma' ? 'daniel' : 'fatma';
}

// ── token ─────────────────────────────────────────────────────────────────

function tokenKey(profile: ChatProfile): string {
  return `${TOKEN_KEY_PREFIX}-${profile}`;
}

export function getChatToken(profile: ChatProfile): string | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(tokenKey(profile));
  return raw && raw.trim() ? raw.trim() : null;
}

export function setChatToken(profile: ChatProfile, token: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(tokenKey(profile), token.trim());
}

export function clearChatToken(profile: ChatProfile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(tokenKey(profile));
}

// ── low-level fetch wrapper ───────────────────────────────────────────────

async function api<T>(
  profile: ChatProfile,
  query: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getChatToken(profile);
  if (!token) throw new ChatApiError(401, 'no_token');
  const res = await fetch(`${BASE}${query}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-chat-token': token,
      ...(init.headers || {})
    }
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — keep null */
  }
  if (!res.ok) {
    const code =
      body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string'
        ? (body as { error: string }).error
        : 'request_failed';
    throw new ChatApiError(res.status, code);
  }
  return body as T;
}

/** True when the failure smells like connectivity (worth queueing/retrying). */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ChatApiError) return false; // server answered — not offline
  return e instanceof TypeError || (e instanceof Error && e.name === 'AbortError');
}

// ── endpoints ─────────────────────────────────────────────────────────────

export async function fetchSince(profile: ChatProfile, since: number, conversationId = 'main'): Promise<ChatSince> {
  const query = `?since=${Math.max(0, Math.floor(since))}&conversationId=${encodeURIComponent(conversationId)}`;
  const data = await api<Partial<ChatSince>>(profile, query);
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    meta: normalizeMeta(data.meta)
  };
}

export async function fetchMedia(profile: ChatProfile, id: string): Promise<string> {
  const data = await api<{ dataUrl?: string }>(profile, `?media=${encodeURIComponent(id)}`);
  if (!data.dataUrl) throw new ChatApiError(404, 'media_not_found');
  return data.dataUrl;
}

export async function sendText(
  profile: ChatProfile,
  text: string,
  conversationId = 'main',
  clientId?: string
): Promise<{ message: ChatMessage; meta: ChatMeta }> {
  const data = await api<{ message: ChatMessage; meta?: ChatMeta }>(profile, '', {
    method: 'POST',
    body: JSON.stringify({ text, conversationId, clientId })
  });
  return { message: data.message, meta: normalizeMeta(data.meta) };
}

export async function sendMediaDataUrl(
  profile: ChatProfile,
  dataUrl: string,
  name?: string,
  conversationId = 'main',
  clientId?: string
): Promise<{ message: ChatMessage; meta: ChatMeta }> {
  const data = await api<{ message: ChatMessage; meta?: ChatMeta }>(profile, '', {
    method: 'POST',
    body: JSON.stringify({ media: dataUrl, name, conversationId, clientId })
  });
  return { message: data.message, meta: normalizeMeta(data.meta) };
}

/**
 * Send a File/Blob: images are canvas-downscaled to MAX_IMAGE_EDGE px JPEG
 * first; audio is base64'd as-is. Throws ChatApiError(413,'media_too_large')
 * client-side when the encoded payload would blow the server cap.
 */
export async function sendMedia(
  profile: ChatProfile,
  file: File | Blob,
  name?: string
): Promise<{ message: ChatMessage; meta: ChatMeta }> {
  const dataUrl = await prepareMediaDataUrl(file);
  return sendMediaDataUrl(profile, dataUrl, name ?? (file instanceof File ? file.name : undefined));
}

export async function markRead(profile: ChatProfile, ts: number): Promise<ChatMeta> {
  const data = await api<{ meta?: ChatMeta }>(profile, '', {
    method: 'POST',
    body: JSON.stringify({ read: Math.floor(ts) })
  });
  return normalizeMeta(data.meta);
}

function normalizeMeta(raw: unknown): ChatMeta {
  const meta: ChatMeta = { latestTs: 0, lastRead: { fatma: 0, daniel: 0 } };
  if (raw && typeof raw === 'object') {
    const r = raw as { latestTs?: unknown; lastRead?: { fatma?: unknown; daniel?: unknown } };
    if (typeof r.latestTs === 'number') meta.latestTs = r.latestTs;
    if (typeof r.lastRead?.fatma === 'number') meta.lastRead.fatma = r.lastRead.fatma;
    if (typeof r.lastRead?.daniel === 'number') meta.lastRead.daniel = r.lastRead.daniel;
  }
  return meta;
}

// ── media preparation ─────────────────────────────────────────────────────

export async function prepareMediaDataUrl(file: File | Blob): Promise<string> {
  const type = file.type || '';
  let dataUrl: string;
  if (type.startsWith('image/')) {
    dataUrl = await downscaleImage(file);
  } else if (type.startsWith('audio/')) {
    // MediaRecorder blobs often carry codec params ('audio/webm;codecs=opus')
    // which the server's dataURL validation rejects — strip to the bare mime.
    dataUrl = normalizeDataUrl(await blobToDataUrl(file));
  } else {
    throw new ChatApiError(400, 'invalid_media');
  }
  const base64 = dataUrl.split(',')[1] ?? '';
  const decodedBytes = Math.floor((base64.length * 3) / 4);
  if (decodedBytes > MAX_MEDIA_BYTES) throw new ChatApiError(413, 'media_too_large');
  return dataUrl;
}

/** Rebuild 'data:<mime>;base64,<payload>' with any extra params stripped. */
function normalizeDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !dataUrl.startsWith('data:')) return dataUrl;
  const header = dataUrl.slice(5, comma); // e.g. 'audio/webm;codecs=opus;base64'
  const mime = header.split(';')[0];
  return `data:${mime};base64,${dataUrl.slice(comma + 1)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

/** Downscale an image blob to max 1280px on its longest edge, JPEG ~0.8. */
async function downscaleImage(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_decode_failed'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Canvas unavailable (very old browser) — fall back to raw base64.
      return blobToDataUrl(blob);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── offline outbox ────────────────────────────────────────────────────────

function outboxKey(profile: ChatProfile): string {
  return `${OUTBOX_KEY_PREFIX}-${profile}`;
}

export function readOutbox(profile: ChatProfile): OutboxItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(outboxKey(profile));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(profile: ChatProfile, items: OutboxItem[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(outboxKey(profile), JSON.stringify(items));
  } catch (e) {
    console.error('[chat] outbox write failed (quota?)', e);
  }
}

/** Queue a send for later. Returns false when the outbox would overflow. */
export function queueOutbox(profile: ChatProfile, item: OutboxItem): boolean {
  // Re-queueing the same optimistic bubble must not create multiple sends.
  const items = readOutbox(profile).filter((existing) => existing.localId !== item.localId);
  items.push(item);
  const serialized = JSON.stringify(items);
  if (serialized.length > MAX_OUTBOX_CHARS) return false;
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(outboxKey(profile), serialized);
    return true;
  } catch {
    return false;
  }
}

export function removeFromOutbox(profile: ChatProfile, localId: string): void {
  writeOutbox(
    profile,
    readOutbox(profile).filter((i) => i.localId !== localId)
  );
}

/**
 * Flush queued sends in order. Stops at the first connectivity failure
 * (items stay queued); drops items the server permanently rejects (4xx).
 * Returns the messages that made it through.
 */
const flushTails = new Map<ChatProfile, Promise<void>>();

async function serializedProfileFlush<T>(profile: ChatProfile, task: () => Promise<T>): Promise<T> {
  const previous = flushTails.get(profile) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  flushTails.set(profile, tail);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (flushTails.get(profile) === tail) flushTails.delete(profile);
  }
}

export async function flushOutbox(profile: ChatProfile, conversationId = 'main'): Promise<ChatMessage[]> {
  return serializedProfileFlush(profile, async () => {
    const sent: ChatMessage[] = [];
    const selected = readOutbox(profile).filter(
      (item) => (item.conversationId || 'main') === conversationId
    );
    for (const item of selected) {
      try {
        let result: { message: ChatMessage };
        if (item.kind === 'text' && item.text) {
          result = await sendText(profile, item.text, conversationId, item.localId);
        } else if (item.kind === 'media' && item.media) {
          result = await sendMediaDataUrl(profile, item.media, item.name, conversationId, item.localId);
        } else {
          removeFromOutbox(profile, item.localId);
          continue;
        }
        sent.push(result.message);
        removeFromOutbox(profile, item.localId);
      } catch (e) {
        if (e instanceof ChatApiError && e.status >= 400 && e.status < 500 && e.status !== 401) {
          // Permanently rejected — don't wedge the queue behind it.
          removeFromOutbox(profile, item.localId);
          continue;
        }
        break; // offline / 401 / 5xx — keep the queue and retry later
      }
    }
    return sent;
  });
}

export function mintLocalId(profile: ChatProfile): string {
  return `local-${Date.now()}-${profile}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── couple sync (shared points + love/nudge pings + async game scores) ──────
//
// Rides the same blob + token backend as chat; the state lives on `meta.couple`
// so a single GET returns both the chat cursor and the couple state.

export interface CouplePing {
  kind: 'love' | 'nudge';
  ts: number;
}

export interface CoupleData {
  points: Record<ChatProfile, number>;
  scores: Record<string, Partial<Record<ChatProfile, number>>>;
  pings: Record<ChatProfile, CouplePing | null>;
}

export interface CoupleSnapshot {
  couple: CoupleData;
  latestTs: number;
}

function normalizePing(raw: unknown): CouplePing | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as { kind?: unknown; ts?: unknown };
  if ((p.kind !== 'love' && p.kind !== 'nudge') || typeof p.ts !== 'number') return null;
  return { kind: p.kind, ts: p.ts };
}

function normalizeCouple(raw: unknown): CoupleData {
  const couple: CoupleData = {
    points: { fatma: 0, daniel: 0 },
    scores: {},
    pings: { fatma: null, daniel: null }
  };
  if (!raw || typeof raw !== 'object') return couple;
  const r = raw as {
    points?: { fatma?: unknown; daniel?: unknown };
    scores?: Record<string, { fatma?: unknown; daniel?: unknown }>;
    pings?: { fatma?: unknown; daniel?: unknown };
  };
  if (typeof r.points?.fatma === 'number') couple.points.fatma = r.points.fatma;
  if (typeof r.points?.daniel === 'number') couple.points.daniel = r.points.daniel;
  if (r.scores && typeof r.scores === 'object') {
    for (const [gameId, entry] of Object.entries(r.scores)) {
      if (!entry || typeof entry !== 'object') continue;
      const e: Partial<Record<ChatProfile, number>> = {};
      if (typeof entry.fatma === 'number') e.fatma = entry.fatma;
      if (typeof entry.daniel === 'number') e.daniel = entry.daniel;
      couple.scores[gameId] = e;
    }
  }
  couple.pings.fatma = normalizePing(r.pings?.fatma);
  couple.pings.daniel = normalizePing(r.pings?.daniel);
  return couple;
}

function snapshotFromMeta(raw: unknown): CoupleSnapshot {
  const meta = raw as { couple?: unknown; latestTs?: unknown } | null;
  return {
    couple: normalizeCouple(meta?.couple),
    latestTs: typeof meta?.latestTs === 'number' ? meta.latestTs : 0
  };
}

/** Read the shared couple state (cheap: hits the chat GET meta fast-path). */
export async function fetchCoupleSnapshot(profile: ChatProfile, since: number): Promise<CoupleSnapshot> {
  const query = `?since=${Math.max(0, Math.floor(since))}&conversationId=__couple`;
  const data = await api<{ meta?: unknown }>(profile, query);
  return snapshotFromMeta(data.meta);
}

async function postCouple(profile: ChatProfile, couple: Record<string, unknown>): Promise<CoupleSnapshot> {
  const data = await api<{ meta?: unknown }>(profile, '', {
    method: 'POST',
    body: JSON.stringify({ couple })
  });
  return snapshotFromMeta(data.meta);
}

/** Add `n` shared points authored by `profile` (batched tap flush). */
export function postCouplePoints(profile: ChatProfile, n: number): Promise<CoupleSnapshot> {
  return postCouple(profile, { kind: 'point', n: Math.max(1, Math.floor(n)) });
}

/** Leave a "love" ping the partner's poller will surface as a toast. */
export function postCoupleLove(profile: ChatProfile): Promise<CoupleSnapshot> {
  return postCouple(profile, { kind: 'love' });
}

/** Leave a "nudge/saudades" ping — the partner's poller vibrates on it. */
export function postCoupleNudge(profile: ChatProfile): Promise<CoupleSnapshot> {
  return postCouple(profile, { kind: 'nudge' });
}

/** Submit an async-competition high score for a game (server keeps the max). */
export function postCoupleScore(profile: ChatProfile, gameId: string, score: number): Promise<CoupleSnapshot> {
  return postCouple(profile, { kind: 'score', gameId, score: Math.max(0, Math.floor(score)) });
}
