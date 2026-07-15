// Web Push — subscrição deste dispositivo para receber os pings de casal
// mesmo com a app fechada. A subscrição fica em push_subscriptions (RLS:
// apenas o dono); o envio é feito pela função Netlify push-ping, que valida o
// evento e lê os endpoints com credenciais de servidor.
//
// iPhone: o Web Push só funciona com a app INSTALADA no ecrã principal
// (iOS 16.4+), e o padrão de vibração é sempre o do sistema. Android: padrão
// de vibração próprio por tipo de ping (ver static/push-sw.js).

import { getSupabaseClient } from '$lib/multiplayer/client';
import { isMultiplayerConfigured } from '$lib/multiplayer/config';
import { getAuthSession, getAuthUser } from '$lib/account/auth';

// Chave VAPID PÚBLICA (é pública por desenho — o par privado vive só no
// ambiente da função Netlify).
export const VAPID_PUBLIC_KEY =
  'BKK2RHFTXc4rpyXnN2Y4y1bwb9IuZjtG-mw-flND2OxOWqfvP02wXO888EWmxQ6WFDTvoYHHYZbwk1AgkPfoKQg';

export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on';
export type PushKind = 'love' | 'nudge' | 'message' | 'call';
export type ForegroundPushKind = PushKind | 'test';
export const PUSH_FOREGROUND_EVENT_TYPE = 'presuntinho:push-event' as const;

/** Canonical payload posted by push-sw.js when the app is already foregrounded. */
export interface ForegroundPushEvent {
  type: typeof PUSH_FOREGROUND_EVENT_TYPE;
  eventId: string;
  kind: ForegroundPushKind;
  title: string;
  body: string;
  url: string;
  /** Authenticated sender, filled by the Netlify function (never trusted from the browser). */
  senderId: string;
  /** Present for call notifications; validated against call_sessions by the server. */
  callId?: string;
}

function newPushEventId(): string {
  return crypto.randomUUID();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Estado atual das notificações push NESTE dispositivo. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    // No iPhone fora do modo instalado o Push API nem existe — orienta o user.
    if (isIos() && !isStandalone()) return 'ios-needs-install';
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Ativa as notificações push neste dispositivo (chamar num gesto do user). */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (!isMultiplayerConfigured()) return 'unsupported';
  const user = await getAuthUser();
  if (!user) return 'unsupported'; // precisa de conta (a subscrição é por conta)

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.ready;
  // Se houver um SW novo à ESPERA (update em prompt-mode), ativa-o já — quem
  // pede notificações precisa do worker com os handlers de push mais recentes.
  try {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      await new Promise<void>((resolve) => {
        const done = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', done);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', done);
        setTimeout(done, 2500); // best-effort — não bloquear o fluxo
      });
    }
  } catch {
    /* best-effort */
  }
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }));

  const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return 'off';
  const { error } = await getSupabaseClient().from('push_subscriptions').upsert({
    endpoint: raw.endpoint,
    account: user.id,
    p256dh: raw.keys.p256dh,
    auth: raw.keys.auth,
    ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : null
  });
  if (error) throw error;
  return 'on';
}

/** Desativa as notificações push neste dispositivo. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    if (isMultiplayerConfigured()) {
      await getSupabaseClient().from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
  } catch {
    /* best-effort */
  }
}

/** Entrega uma notificação push (fire-and-forget). Pings vão para o parceiro
 *  do casal (resolvido no servidor); mensagens levam o destinatário explícito.
 *  title/body chegam já localizados de quem envia. */
type PushNotifyOptions = {
  title?: string;
  body?: string;
  to?: string;
  url?: string;
  eventId?: string;
  callId?: string;
};

export function sendPushNotify(
  kind: 'love' | 'nudge',
  opts: PushNotifyOptions & { eventId: string }
): Promise<void>;
export function sendPushNotify(kind: 'message' | 'call', opts: PushNotifyOptions): Promise<void>;
export async function sendPushNotify(
  kind: PushKind,
  opts: PushNotifyOptions
): Promise<void> {
  try {
    const session = await getAuthSession();
    if (!session) return;
    // Couple pings must reference the durable couple_pings row created by the
    // caller. Never mint a replacement id here: the server consumes that row
    // as its one-shot delivery authorisation.
    const eventId =
      kind === 'love' || kind === 'nudge' ? opts.eventId : (opts.eventId ?? newPushEventId());
    if (!eventId) return;
    await fetch('/.netlify/functions/push-ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        eventId,
        kind,
        title: opts.title,
        body: opts.body ?? '',
        // The server only honours an explicit recipient for `message`.
        to: kind === 'message' ? opts.to : undefined,
        url: opts.url,
        // For calls, the server validates the row and derives both users.
        callId: kind === 'call' ? opts.callId : undefined
      })
    });
  } catch {
    /* o realtime continua a ser o caminho rápido — push é bónus */
  }
}

/** Compat: ping para o parceiro do casal. */
export async function sendPingPush(
  kind: 'love' | 'nudge',
  title: string,
  body: string,
  eventId: string
): Promise<void> {
  return sendPushNotify(kind, { title, body, eventId });
}

/** Auto-teste: pede ao servidor um push para OS MEUS dispositivos e devolve o
 *  número realmente enviado para diagnóstico visível no ecrã. */
export async function sendTestPush(title: string, body: string): Promise<{ sent: number } | null> {
  try {
    const session = await getAuthSession();
    if (!session) return null;
    const res = await fetch('/.netlify/functions/push-ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ eventId: newPushEventId(), kind: 'test', title, body })
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sent?: number };
    return { sent: data.sent ?? 0 };
  } catch {
    return null;
  }
}

// Throttle simples por conversa para os pushes de mensagens — uma rajada de
// mensagens gera UM push (o realtime/badge cobre o resto).
const MSG_PUSH_GAP_MS = 15_000;
const lastMsgPushAt = new Map<string, number>();

export function shouldPushMessage(threadKey: string): boolean {
  const now = Date.now();
  const last = lastMsgPushAt.get(threadKey) ?? 0;
  if (now - last < MSG_PUSH_GAP_MS) return false;
  lastMsgPushAt.set(threadKey, now);
  return true;
}
