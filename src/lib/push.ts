// Web Push — subscrição deste dispositivo para receber os pings de casal
// mesmo com a app fechada. A subscrição fica em push_subscriptions (RLS:
// dono + parceiro de casal); o envio é feito pela função Netlify push-ping.
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

/** Entrega um ping como push nos dispositivos do parceiro (fire-and-forget).
 *  title/body chegam já localizados de quem envia. */
export async function sendPingPush(kind: 'love' | 'nudge', title: string, body: string): Promise<void> {
  try {
    const session = await getAuthSession();
    if (!session) return;
    await fetch('/.netlify/functions/push-ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ kind, title, body })
    });
  } catch {
    /* o broadcast realtime continua a ser o caminho rápido — push é bónus */
  }
}
