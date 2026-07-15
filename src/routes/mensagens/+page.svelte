<script lang="ts">
  /**
   * /mensagens — private WhatsApp-style chat between fatma and daniel.
   *
   * Session-native (push 6f5a4bb, 2026-07-04): identity comes from the app
   * session (httpOnly cookie via src/lib/auth/session.ts); no password UI.
   * The backend still validates a per-profile chat credential on every
   * request (CHAT_TOKEN_FATMA / CHAT_TOKEN_DANIEL), but the user never sees
   * a code prompt — that flow was removed.
   *
   * - Transport: netlify/functions/chat.js (Netlify Blobs), polled by
   *   ChatStore (src/lib/chat/store.svelte.ts) every 4s while visible.
   * - Auth: session first; secure_setup collapsed into a small <details>
   *   for ops only (line ~351) — never a user-facing barrier.
   * - Composer: fixed dock with the same geometry as /agente (bottom above
   *   the bottom-nav, width min(800px, 100vw - .75rem), z-index 65) so the
   *   layout's --page-bottom-inset clearance applies identically.
   * - Read receipts: ✓ = delivered to the server, ✓✓ (accent) = the other
   *   person's lastRead cursor passed the message. markRead fires when the
   *   page is visible AND focused.
   */
  import { onMount, tick } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { getSession, isLegacyProfile } from '$lib/auth/session';
  import { showToast } from '$lib/components/events';
  import { playSfx } from '$lib/gamification/sound';
  import { ChatApiError, getChatToken, setChatToken, otherProfile, type ChatProfile } from '$lib/chat/client';
  import { ChatStore, type LocalChatMessage } from '$lib/chat/store.svelte';
  import {
    AccountChatError,
    AccountChatStore,
    listAccountChatInbox,
    type AccountChatInboxItem
  } from '$lib/chat/account-chat-store.svelte';
  import { formatFileSize, replyLabel, type ChatCallMeta } from '$lib/chat/account-chat-model';
  import { profileFor } from '$lib/profile/people';
  import { couple } from '$lib/couple/couple-store.svelte';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listContacts, listIncoming, subscribeConnections, type Contact } from '$lib/account/contacts';
  import { listSpaces, singleActiveCouple, otherMember } from '$lib/account/spaces';
  import Avatar from '$lib/components/Avatar.svelte';
  import CallButtons from '$lib/calls/CallButtons.svelte';

  type ConversationPreset = {
    id: string;
    titleKey: string;
    icon: string;
    descKey: string;
  };

  type PanelMode = 'none' | 'conversations' | 'files';

  const REACTIONS = ['❤️', '😂', '🥰', '😮', '😢', '👍'];

  const CONVERSATIONS: ConversationPreset[] = [
    { id: 'main', titleKey: 'mensagens.conversations.main', icon: '💬', descKey: 'mensagens.conversations.main_desc' },
    { id: 'memories', titleKey: 'mensagens.conversations.memories', icon: '🗂️', descKey: 'mensagens.conversations.memories_desc' },
    { id: 'photos', titleKey: 'mensagens.conversations.photos', icon: '📷', descKey: 'mensagens.conversations.photos_desc' },
    { id: 'plans', titleKey: 'mensagens.conversations.plans', icon: '📝', descKey: 'mensagens.conversations.plans_desc' },
    { id: 'voice', titleKey: 'mensagens.conversations.voice', icon: '🎙️', descKey: 'mensagens.conversations.voice_desc' }
  ];

  const SELECTED_CONVERSATION_KEY = 'presuntinho-mensagens-selected-conversation';

  let profile = $state<ChatProfile | null>(null);
  let noSession = $state(false);
  let secureSetupNeeded = $state(false);
  let setupKeyInput = $state('');
  let setupOpen = $state(false);
  let store = $state<ChatStore | AccountChatStore | null>(null);
  let selectedConversationId = $state('main');
  // WhatsApp-style two-pane flow on one screen: the conversation LIST, then the
  // open THREAD. Always start on the list so it reads like a messenger home.
  let view = $state<'list' | 'thread'>('list');
  let panelMode = $state<PanelMode>('none');
  // Social v2 — the list also carries friend DMs (text-only threads) and
  // pending requests. threadKind picks which store the open thread runs on.
  let threadKind = $state<'couple' | 'dm'>('couple');
  let dmOther = $state<Contact | null>(null);
  let dmContacts = $state<Contact[]>([]);
  let incomingReqs = $state<Contact[]>([]);
  let accountInbox = $state<AccountChatInboxItem[]>([]);
  // Couple partner shown on the couple row/header: legacy persona OR the
  // account partner from the active couple space (fixes the fatma/daniel
  // fallback leaking into account couples).
  let acctPartner = $state<{ id: string; label: string; emoji: string; handle: string } | null>(null);
  let acctCoupleId = $state<string | null>(null);
  let legacy = $state(true);
  let unsubConn: (() => void) | null = null;

  let input = $state('');
  let recording = $state(false);
  let keyboardInset = $state(0);
  let pageActive = $state(true);
  let viewerSrc = $state<string | null>(null);
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let replyingTo = $state<LocalChatMessage | null>(null);
  let editingMessage = $state<LocalChatMessage | null>(null);
  let messageMenuId = $state<string | null>(null);

  let scrollEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let mediaRecorder: MediaRecorder | null = null;
  let recordingChunks: BlobPart[] = [];
  let inboxPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── day grouping ─────────────────────────────────────────────────────────

  type DayGroup = {
    key: string;
    kind: 'today' | 'yesterday' | 'date';
    date: Date;
    items: LocalChatMessage[];
  };

  function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const groups = $derived.by<DayGroup[]>(() => {
    if (!store) return [];
    const now = new Date();
    const todayKey = localDayKey(now);
    const yesterdayKey = localDayKey(new Date(now.getTime() - 86_400_000));
    const out: DayGroup[] = [];
    const needle = searchQuery.trim().toLocaleLowerCase($locale || 'pt-PT');
    const visible = needle
      ? store.messages.filter((m) =>
          [m.text, m.name, m.reply?.text].some((value) => value?.toLocaleLowerCase($locale || 'pt-PT').includes(needle))
        )
      : store.messages;
    for (const m of visible) {
      const date = new Date(m.ts);
      const key = localDayKey(date);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(m);
      } else {
        out.push({
          key,
          kind: key === todayKey ? 'today' : key === yesterdayKey ? 'yesterday' : 'date',
          date,
          items: [m]
        });
      }
    }
    return out;
  });

  const other = $derived(profile ? otherProfile(profile) : 'daniel');
  const meProfile = $derived(profileFor(profile));
  const otherPerson = $derived(profileFor(other));
  const syncBlocked = $derived(Boolean(legacy && threadKind === 'couple' && (secureSetupNeeded || store?.authError)));
  const richStore = $derived(store instanceof AccountChatStore ? store : null);
  // Couple surface lights up for the legacy pair AND active account couples.
  const canCouple = $derived(couple.available);
  // Partner identity for the couple thread, by session kind.
  const partnerName = $derived(legacy ? $t(otherPerson.nameKey) : (acctPartner?.label ?? '💞'));
  const partnerEmoji = $derived(legacy ? otherPerson.emoji : (acctPartner?.emoji ?? '💞'));
  const partnerHref = $derived(legacy ? `/perfil/${other}/` : acctPartner ? `/u/?h=${acctPartner.handle}` : '/contactos/');
  const meEmoji = $derived(legacy ? meProfile.emoji : (accountState.account?.emoji ?? '🙂'));
  const meHref = $derived(legacy ? '/perfil/' : '/conta/');
  const selectedConversation = $derived(CONVERSATIONS.find((c) => c.id === selectedConversationId) ?? CONVERSATIONS[0]);
  const fileMessages = $derived((store?.messages ?? []).filter((m) => !m.deleted && Boolean(m.mediaType || m.mediaKey || m.localDataUrl)));

  function conversationPreview(id: string): string {
    const last = [...(store?.messages ?? [])].reverse().find((m) => (m.conversationId || 'main') === id);
    if (!last) {
      const inbox = coupleInboxItem(id);
      return inboxPreview(inbox) ?? $t(CONVERSATIONS.find((c) => c.id === id)?.descKey ?? 'mensagens.conversations.empty_preview');
    }
    if (last.deleted) return $t('mensagens.message.deleted', { default: 'Mensagem apagada' });
    if (last.text) return last.text.slice(0, 64);
    if (last.mediaType?.startsWith('audio/')) return $t('mensagens.files.audio', { default: 'Áudio' });
    if (last.mediaType?.startsWith('image/')) return $t('mensagens.files.image', { default: 'Imagem' });
    if (last.mediaType?.startsWith('video/')) return $t('mensagens.files.video', { default: 'Vídeo' });
    return $t('mensagens.files.file', { default: 'Ficheiro' });
  }

  function coupleInboxItem(topic: string): AccountChatInboxItem | null {
    return accountInbox.find(
      (item) => item.kind === 'couple' && item.topic === topic && (!acctCoupleId || item.spaceId === acctCoupleId)
    ) ?? null;
  }

  function dmInboxItem(accountId: string): AccountChatInboxItem | null {
    return accountInbox.find(
      (item) => item.kind === 'direct' && item.topic === 'main' && item.otherAccount === accountId
    ) ?? null;
  }

  function inboxPreview(item: AccountChatInboxItem | null): string | null {
    if (!item?.lastMessageId || !item.lastMessageKind) return null;
    if (item.lastMessageKind === 'call') return callMetaLabel(item.lastCall);
    if (item.lastMessageBody) return item.lastMessageBody.slice(0, 64);
    if (item.lastMessageKind === 'image') return $t('mensagens.files.image', { default: 'Imagem' });
    if (item.lastMessageKind === 'audio') return $t('mensagens.files.audio', { default: 'Áudio' });
    if (item.lastMessageKind === 'video') return $t('mensagens.files.video', { default: 'Vídeo' });
    if (item.lastMessageKind === 'file') return $t('mensagens.files.file', { default: 'Ficheiro' });
    return $t('mensagens.message.deleted', { default: 'Mensagem apagada' });
  }

  function conversationUnread(topic: string): number {
    return coupleInboxItem(topic)?.unreadCount ?? 0;
  }

  function fmtDate(d: Date): string {
    try {
      return d.toLocaleDateString($locale || 'pt-PT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
    } catch {
      return localDayKey(d);
    }
  }

  function fmtTime(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString($locale || 'pt-PT', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function richPresenceLabel(): string | null {
    if (!richStore) return null;
    if (richStore.otherTyping) return $t('mensagens.presence.typing', { default: 'a escrever…' });
    if (richStore.otherOnline) return $t('mensagens.presence.online', { default: 'online' });
    if (richStore.otherLastSeen) {
      return $t('mensagens.presence.last_seen', {
        values: { time: fmtTime(richStore.otherLastSeen) },
        default: 'visto pela última vez às {time}'
      });
    }
    return null;
  }

  function callMetaLabel(call: ChatCallMeta | null | undefined): string {
    if (!call) return $t('mensagens.message.call_event', { default: 'Chamada' });
    const kind = call.kind === 'video'
      ? $t('mensagens.call.video', { default: 'Videochamada' })
      : $t('mensagens.call.audio', { default: 'Chamada de voz' });
    const status = $t(`mensagens.call.status.${call.status}`, {
      default: call.status
    });
    return `${kind} · ${status}`;
  }

  function callHistoryLabel(message: LocalChatMessage): string {
    return callMetaLabel(message.call);
  }

  function callDuration(message: LocalChatMessage): string | null {
    const call = message.call;
    if (!call?.answeredAt || !call.endedAt) return null;
    const seconds = Math.max(
      0,
      Math.floor((new Date(call.endedAt).getTime() - new Date(call.answeredAt).getTime()) / 1_000)
    );
    if (!Number.isFinite(seconds)) return null;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    // The page body is the actual scroller on mobile (the list grows the
    // document) — keep the newest bubble above the fixed composer.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }

  function startChat() {
    if (!profile) return;
    store?.stop();
    threadKind = 'couple';
    dmOther = null;
    // Grandfathered Fatma/Daniel profiles always stay on the authenticated
    // Netlify endpoint. Never let them fall through to a Supabase anon client.
    if (legacy) {
      store = new ChatStore(profile, selectedConversationId);
      secureSetupNeeded = !getChatToken(profile);
      store.start();
      return;
    }
    const me = accountState.account;
    const partnerId = acctPartner?.id ?? couple.partnerId;
    const activeCoupleId = acctCoupleId ?? couple.coupleId;
    if (!me || !partnerId || !activeCoupleId) {
      store = null;
      secureSetupNeeded = false;
      return;
    }
    store = new AccountChatStore({
      meId: me.id,
      peerId: partnerId,
      kind: 'couple',
      spaceId: activeCoupleId,
      topic: selectedConversationId
    });
    secureSetupNeeded = false;
    store.start();
  }

  /** Open a full rich-media friend DM, keyed dm:<a>:<b> in Supabase. */
  function openDm(c: Contact): void {
    if (!accountState.account) return;
    store?.stop();
    threadKind = 'dm';
    dmOther = c;
    secureSetupNeeded = false;
    panelMode = 'none';
    view = 'thread';
    store = new AccountChatStore({ meId: accountState.account.id, peerId: c.id, kind: 'direct', topic: 'main' });
    store.start();
    void scrollToBottom();
  }

  /** Contacts, requests and the couple partner for the list view. */
  async function refreshSocial(): Promise<void> {
    if (!accountState.account) return;
    try {
      const [cs, inc, spaces] = await Promise.all([listContacts(), listIncoming(), listSpaces()]);
      incomingReqs = inc;
      const active = singleActiveCouple(spaces);
      const partner = active ? otherMember(active, accountState.account.id) : null;
      acctCoupleId = active?.id ?? null;
      acctPartner = partner
        ? { id: partner.id, label: partner.display_name || `@${partner.handle}`, emoji: partner.emoji ?? '💞', handle: partner.handle }
        : null;
      // The couple partner lives on the pinned couple thread — not as a DM row.
      dmContacts = partner ? cs.filter((c) => c.id !== partner.id) : cs;
      await refreshInbox();
    } catch (e) {
      console.warn('[mensagens] social refresh failed', e);
    }
  }

  async function refreshInbox(): Promise<void> {
    if (legacy || !accountState.account) return;
    try {
      accountInbox = await listAccountChatInbox();
    } catch (error) {
      // Keep contacts usable during rolling deploys or a temporary network
      // failure; the open conversation store continues to recover separately.
      console.warn('[mensagens] inbox refresh failed', error);
    }
  }

  function selectConversation(id: string): void {
    selectedConversationId = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(SELECTED_CONVERSATION_KEY, id);
    panelMode = 'none';
    view = 'thread'; // WhatsApp-style: tapping a chat row opens its thread
    startChat();
    void scrollToBottom();
  }

  /** WhatsApp-style back arrow: return from a thread to the conversation list. */
  function backToList(): void {
    panelMode = 'none';
    searchOpen = false;
    searchQuery = '';
    replyingTo = null;
    editingMessage = null;
    messageMenuId = null;
    view = 'list';
    // Leaving a DM restores the couple store, so the couple rows' previews on
    // the list read from the right thread again.
    if (threadKind === 'dm') startChat();
    void refreshInbox();
  }

  /** Timestamp of the last message in a conversation (0 when unknown/empty). */
  function conversationLastTs(id: string): number {
    const last = [...(store?.messages ?? [])].reverse().find((m) => (m.conversationId || 'main') === id);
    return last?.ts ?? coupleInboxItem(id)?.lastMessageAt ?? 0;
  }

  function saveSecureKey() {
    if (!profile) return;
    const value = setupKeyInput.trim();
    if (!value) {
      showToast($t('mensagens.secure_setup.missing', { default: 'Falta a chave de ligação para activar a sincronização neste dispositivo.' }));
      return;
    }
    setChatToken(profile, value);
    setupKeyInput = '';
    setupOpen = false;
    startChat();
  }

  function syncKeyboardInset(): void {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) {
      keyboardInset = 0;
      return;
    }
    keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  }

  function syncActive(): void {
    if (typeof document === 'undefined') return;
    pageActive = document.visibilityState === 'visible' && document.hasFocus();
  }

  onMount(() => {
    const session = getSession();
    if (!session) {
      noSession = true;
      return;
    }
    profile = session.profile as ChatProfile;
    legacy = isLegacyProfile(session.profile);
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(SELECTED_CONVERSATION_KEY);
      if (saved && CONVERSATIONS.some((c) => c.id === saved)) selectedConversationId = saved;
    }
    startChat();

    // Account sessions also carry friends (DM rows) + pending requests, and a
    // ?dm=<handle> deep link (profile page's "Mensagem" button) opens straight
    // into that thread.
    if (!legacy) {
      void (async () => {
        await startAccountSync();
        if (!accountState.account) return;
        await refreshSocial();
        if (threadKind === 'couple') startChat();
        unsubConn = subscribeConnections(() => void refreshSocial());
        inboxPollTimer = setInterval(() => {
          if (view === 'list' && document.visibilityState === 'visible') void refreshInbox();
        }, 10_000);
        const dmHandle = page.url.searchParams.get('dm');
        if (dmHandle) {
          const target = dmContacts.find((c) => c.handle.toLowerCase() === dmHandle.toLowerCase());
          if (target) openDm(target);
          else void goto(`/u/?h=${encodeURIComponent(dmHandle)}`);
        }
      })();
    }

    syncKeyboardInset();
    syncActive();
    window.visualViewport?.addEventListener('resize', syncKeyboardInset);
    window.visualViewport?.addEventListener('scroll', syncKeyboardInset);
    window.addEventListener('focus', syncActive);
    window.addEventListener('blur', syncActive);
    document.addEventListener('visibilitychange', syncActive);
    return () => {
      window.visualViewport?.removeEventListener('resize', syncKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', syncKeyboardInset);
      window.removeEventListener('focus', syncActive);
      window.removeEventListener('blur', syncActive);
      document.removeEventListener('visibilitychange', syncActive);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      unsubConn?.();
      if (inboxPollTimer) clearInterval(inboxPollTimer);
      store?.stop();
    };
  });

  // Auto-scroll when the conversation grows — but ONLY when the user was
  // already near the bottom (or on the initial load). Reading old messages
  // must never have the scroll stolen; the "ir para o fim" FAB appears
  // instead (V10.1).
  let lastCount = 0;
  let showJumpToEnd = $state(false);

  function isNearBottom(): boolean {
    // V10.2 — a lista é o scroller interno; a janela já não rola no chat.
    if (scrollEl) {
      return scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) < 180;
    }
    if (typeof window === 'undefined') return true;
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 180;
  }

  function onListScroll(): void {
    showJumpToEnd = !isNearBottom() && (store?.messages.length ?? 0) > 0;
  }

  $effect(() => {
    const count = store?.messages.length ?? 0;
    if (count !== lastCount) {
      const initialLoad = lastCount === 0;
      const follow = initialLoad || isNearBottom();
      lastCount = count;
      if (follow) {
        void scrollToBottom();
      } else {
        showJumpToEnd = true;
      }
    }
  });

  // Mark incoming messages as read while the page is visible AND focused.
  $effect(() => {
    if (!store || !pageActive) return;
    if (store.unreadCount > 0) void store.markReadUpTo(store.latestIncomingTs);
  });

  // ── sending ──────────────────────────────────────────────────────────────

  function autogrow(): void {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 132)}px`;
    richStore?.setTyping(Boolean(input.trim()) && !editingMessage);
  }

  function afterSendFeedback(result: 'sent' | 'queued' | 'failed'): void {
    if (result === 'queued') {
      showToast($t('mensagens.queued', { default: 'Guardada neste dispositivo — sincroniza quando a ligação segura estiver activa.' }));
    } else if (result === 'failed') {
      showToast($t('mensagens.send_failed', { default: 'A mensagem não seguiu. Toca em «tentar de novo».' }));
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !store) return;
    if (editingMessage && richStore) {
      try {
        await richStore.editMessage(editingMessage.id, text);
        editingMessage = null;
        input = '';
        showToast($t('mensagens.message.edited_toast', { default: 'Mensagem editada.' }));
      } catch {
        showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
        return;
      }
    } else {
      input = '';
      playSfx('send');
      const result = richStore
        ? await richStore.sendTextMessage(text, replyingTo?.id)
        : await store.sendTextMessage(text);
      afterSendFeedback(result);
      replyingTo = null;
    }
    richStore?.setTyping(false);
    if (inputEl) inputEl.style.height = 'auto';
    void scrollToBottom();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function mediaErrorToast(e: unknown): void {
    if (e instanceof AccountChatError && e.code === 'too_large') {
      showToast($t('mensagens.media_too_big_account', { default: 'Esse ficheiro é grandinho demais (máx. 25 MB) 🐘' }));
    } else if (e instanceof ChatApiError && e.status === 413) {
      showToast($t('mensagens.media_too_big', { default: 'Esse ficheiro é grandinho demais (máx. 3 MB) 🐘' }));
    } else if (richStore) {
      showToast($t('mensagens.send_failed', { default: 'A mensagem não seguiu. Toca em «tentar de novo».' }));
    } else {
      showToast($t('mensagens.media_invalid', { default: 'Só consigo enviar imagens e áudios 🙈' }));
    }
  }

  async function onFileChosen(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file || !store) return;
    try {
      const result = richStore
        ? await richStore.sendMediaMessage(file, file.name, replyingTo?.id)
        : await store.sendMediaMessage(file, file.name);
      afterSendFeedback(result);
      replyingTo = null;
    } catch (err) {
      mediaErrorToast(err);
    }
    void scrollToBottom();
  }

  // Audio recording — same getUserMedia/MediaRecorder pattern as /agente.
  async function toggleRecording() {
    if (recording) {
      try {
        mediaRecorder?.stop();
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showToast($t('agente.chat.no_audio_support', { default: 'O teu browser não suporta gravação de áudio.' }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordingChunks = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordingChunks.push(ev.data);
      };
      mr.onstop = async () => {
        recording = false;
        for (const track of stream.getTracks()) track.stop();
        // Strip codec params — the server validates the bare mime type.
        const mime = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(recordingChunks, { type: mime });
        recordingChunks = [];
        if (blob.size === 0 || !store) return;
        try {
          const result = richStore
            ? await richStore.sendMediaMessage(blob, `voz-${Date.now()}.webm`, replyingTo?.id)
            : await store.sendMediaMessage(blob, `voz-${Date.now()}.webm`);
          afterSendFeedback(result);
          replyingTo = null;
        } catch (err) {
          mediaErrorToast(err);
        }
        void scrollToBottom();
      };
      mr.start();
      mediaRecorder = mr;
      recording = true;
    } catch (e) {
      console.error('[mensagens] getUserMedia failed', e);
      showToast($t('agente.chat.mic_denied', { default: 'Não consegui aceder ao microfone. Verifica as permissões.' }));
    }
  }

  async function retry(localId: string) {
    if (!store) return;
    const result = await store.retryMessage(localId);
    afterSendFeedback(result);
  }

  function beginReply(message: LocalChatMessage): void {
    if (!richStore || message.deleted) return;
    replyingTo = message;
    editingMessage = null;
    messageMenuId = null;
    void tick().then(() => inputEl?.focus());
  }

  function beginEdit(message: LocalChatMessage): void {
    if (!richStore || message.deleted || message.from !== richStore.profile || !message.text) return;
    editingMessage = message;
    replyingTo = null;
    input = message.text;
    messageMenuId = null;
    void tick().then(() => {
      autogrow();
      inputEl?.focus();
      inputEl?.setSelectionRange(input.length, input.length);
    });
  }

  function cancelComposeMode(): void {
    replyingTo = null;
    if (editingMessage) input = '';
    editingMessage = null;
    if (inputEl) inputEl.style.height = 'auto';
  }

  async function deleteRichMessage(message: LocalChatMessage): Promise<void> {
    if (!richStore || message.from !== richStore.profile) return;
    messageMenuId = null;
    try {
      await richStore.deleteMessage(message.id);
      showToast($t('mensagens.message.deleted_toast', { default: 'Mensagem apagada.' }));
    } catch {
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function reactTo(message: LocalChatMessage, emoji: string): Promise<void> {
    if (!richStore || message.deleted) return;
    messageMenuId = null;
    try {
      await richStore.toggleReaction(message.id, emoji);
    } catch {
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function toggleStar(message: LocalChatMessage): Promise<void> {
    if (!richStore || message.deleted) return;
    messageMenuId = null;
    try {
      await richStore.toggleStar(message.id);
    } catch {
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function copyMessage(message: LocalChatMessage): Promise<void> {
    messageMenuId = null;
    if (!message.text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(message.text);
      showToast($t('mensagens.message.copied', { default: 'Mensagem copiada.' }));
    } catch {
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  function jumpToMessage(id: string): void {
    const element = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.classList.add('message-highlight');
    setTimeout(() => element?.classList.remove('message-highlight'), 1200);
  }

  function onViewerKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && viewerSrc) viewerSrc = null;
  }
</script>

<svelte:window onkeydown={onViewerKeydown} />

<svelte:head>
  <title>{$t('mensagens.title', { default: 'Mensagens' })} — Presuntinho</title>
</svelte:head>

<div class="chat-root">
  <header class="chat-header">
    {#if view === 'thread' && !noSession}
      <button type="button" class="back-btn" onclick={backToList} aria-label={$t('mensagens.back', { default: 'Voltar às conversas' })}>←</button>
    {/if}
    <div class="header-text">
      {#if view === 'list'}
        <span class="chat-kicker">{$t('mensagens.header.kicker', { default: 'Chat privado' })}</span>
        <h1>{$t('nav.mensagens', { default: 'Mensagens' })}</h1>
      {:else if threadKind === 'dm' && dmOther}
        <span class="chat-kicker">@{dmOther.handle}</span>
        <h1>
          <a class="person-link" href={`/u/?h=${dmOther.handle}`} aria-label={$t('mensagens.aria.open_partner_profile', { default: 'Abrir perfil de {name}', values: { name: dmOther.display_name || `@${dmOther.handle}` } })}>
            {dmOther.display_name || `@${dmOther.handle}`}
          </a>
        </h1>
        <p class="subtitle">
          {#if richPresenceLabel()}
            {richPresenceLabel()}
          {:else if store?.offline}
            {$t('mensagens.status.offline', { default: 'Offline — guardado no dispositivo.' })}
          {:else}
            {$t('mensagens.status.dm', { default: 'Conversa privada entre amigos.' })}
          {/if}
        </p>
      {:else}
        <span class="chat-kicker">{selectedConversation.icon} {$t(selectedConversation.titleKey)}</span>
        <h1>
          <a class="person-link" href={partnerHref} aria-label={$t('mensagens.aria.open_partner_profile', { default: 'Abrir perfil de {name}', values: { name: partnerName } })}>
            {partnerEmoji} {partnerName}
          </a>
        </h1>
        <p class="subtitle">
          {#if richPresenceLabel()}
            {richPresenceLabel()}
          {:else if syncBlocked}
            {$t('mensagens.status.local', { default: 'Modo local — a sincronização segura ainda não está activa neste dispositivo.' })}
          {:else if store?.offline}
            {$t('mensagens.status.offline', { default: 'Offline — guardado no dispositivo.' })}
          {:else}
            {$t('mensagens.status.secure', { default: 'Ligação segura activa.' })}
          {/if}
        </p>
      {/if}
    </div>
    <div class="header-actions">
      {#if view === 'thread' && richStore}
        <CallButtons
          conversationId={richStore.conversationId}
          disabled={!richStore.ready || richStore.offline}
        />
      {/if}
      {#if view === 'thread' && richStore}
        <button
          type="button"
          class:active={searchOpen}
          class="header-action"
          onclick={() => {
            searchOpen = !searchOpen;
            if (!searchOpen) searchQuery = '';
          }}
          aria-label={$t('mensagens.search.open', { default: 'Pesquisar na conversa' })}
          title={$t('mensagens.search.open', { default: 'Pesquisar na conversa' })}
        >🔎</button>
      {/if}
      <a class="profile-link" href={meHref} aria-label={$t('mensagens.aria.open_own_profile', { default: 'Abrir o meu perfil' })} title={$t('mensagens.aria.open_own_profile', { default: 'Abrir o meu perfil' })}>
        {meEmoji}
      </a>
    </div>
  </header>

  {#if view === 'thread' && searchOpen}
    <div class="chat-search" role="search">
      <span aria-hidden="true">🔎</span>
      <input
        type="search"
        bind:value={searchQuery}
        placeholder={$t('mensagens.search.placeholder', { default: 'Pesquisar mensagens…' })}
        aria-label={$t('mensagens.search.placeholder', { default: 'Pesquisar mensagens…' })}
      />
      {#if searchQuery}
        <button type="button" onclick={() => (searchQuery = '')} aria-label={$t('mensagens.search.clear', { default: 'Limpar pesquisa' })}>×</button>
      {/if}
    </div>
  {/if}

  {#if !noSession}
    {#if view === 'list'}
      <!-- WhatsApp-style conversation list: the couple chat is pinned + special,
           friend DMs follow, topic threads after. Tapping a row opens it. -->
      <div class="chat-list" role="group" aria-label={$t('mensagens.conversations.title', { default: 'Conversas' })}>
        {#if !legacy && incomingReqs.length > 0}
          <a class="req-banner" href="/contactos/">
            👋 {$t('mensagens.requests_banner', { values: { n: incomingReqs.length }, default: '{n} pedidos à tua espera — responder' })} →
          </a>
        {/if}
        {#if canCouple}
          <button type="button" class="chat-row couple" onclick={() => selectConversation('main')}>
            <span class="row-av couple-av" aria-hidden="true">{partnerEmoji}</span>
            <span class="row-body">
              <span class="row-top">
                <strong>{partnerName} <span class="couple-heart" aria-hidden="true">💞</span></strong>
                <span class="row-meta">
                  {#if conversationLastTs('main')}<time>{fmtTime(conversationLastTs('main'))}</time>{/if}
                  {#if conversationUnread('main')}
                    <span class="unread-badge" aria-label={$t('mensagens.unread_count', { default: '{n} mensagens por ler', values: { n: conversationUnread('main') } })}>{conversationUnread('main')}</span>
                  {/if}
                </span>
              </span>
              <small>{conversationPreview('main')}</small>
            </span>
          </button>
          {#each CONVERSATIONS.filter((c) => c.id !== 'main') as c (c.id)}
            <button type="button" class="chat-row" onclick={() => selectConversation(c.id)}>
              <span class="row-av" aria-hidden="true">{c.icon}</span>
              <span class="row-body">
                <span class="row-top">
                  <strong>{$t(c.titleKey)}</strong>
                  <span class="row-meta">
                    {#if conversationLastTs(c.id)}<time>{fmtTime(conversationLastTs(c.id))}</time>{/if}
                    {#if conversationUnread(c.id)}
                      <span class="unread-badge" aria-label={$t('mensagens.unread_count', { default: '{n} mensagens por ler', values: { n: conversationUnread(c.id) } })}>{conversationUnread(c.id)}</span>
                    {/if}
                  </span>
                </span>
                <small>{conversationPreview(c.id)}</small>
              </span>
            </button>
          {/each}
        {/if}
        {#if !legacy && accountState.account}
          <h2 class="list-section">{$t('mensagens.friends_section', { default: 'Amigos' })}</h2>
          {#each dmContacts as c (c.id)}
            {@const inbox = dmInboxItem(c.id)}
            <button type="button" class="chat-row" onclick={() => openDm(c)}>
              <Avatar emoji={c.emoji} url={c.avatar_url} size={52} alt="" />
              <span class="row-body">
                <span class="row-top">
                  <strong>{c.display_name || `@${c.handle}`}</strong>
                  <span class="row-meta">
                    {#if inbox?.lastMessageAt}<time>{fmtTime(inbox.lastMessageAt)}</time>{/if}
                    {#if inbox?.unreadCount}
                      <span class="unread-badge" aria-label={$t('mensagens.unread_count', { default: '{n} mensagens por ler', values: { n: inbox.unreadCount } })}>{inbox.unreadCount}</span>
                    {/if}
                  </span>
                </span>
                <small>{inboxPreview(inbox) ?? `@${c.handle}`}</small>
              </span>
            </button>
          {/each}
          {#if dmContacts.length === 0}
            <p class="list-hint">{$t('mensagens.no_friends_hint', { default: 'Quando adicionares amigos, as conversas aparecem aqui.' })}</p>
          {/if}
          <a class="find-row" href="/contactos/">🔍 {$t('mensagens.find_people', { default: 'Procurar pessoas' })}</a>
        {:else if !canCouple}
          <div class="gate card">
            <span class="gate-emoji" aria-hidden="true">💬</span>
            <p>{$t('mensagens.solo_gate', { default: 'As mensagens abrem quando ligares a tua conta a alguém. Por agora, este espaço fica à tua espera. 🤍' })}</p>
            <a class="gate-cta" href="/conta/">{$t('mensagens.solo_cta', { default: 'Criar a minha conta' })} →</a>
          </div>
        {/if}
      </div>
    {:else}
    <nav class="chat-tools" aria-label={$t('mensagens.tools.aria', { default: 'Ferramentas da conversa' })}>
      {#if threadKind === 'couple'}
        <button type="button" class:active={panelMode === 'conversations'} onclick={() => (panelMode = panelMode === 'conversations' ? 'none' : 'conversations')}>
          💬 {$t('mensagens.tools.conversations', { default: 'Conversas' })}
        </button>
      {/if}
      <button type="button" class:active={panelMode === 'files'} onclick={() => (panelMode = panelMode === 'files' ? 'none' : 'files')}>
        📎 {$t('mensagens.tools.files', { default: 'Ficheiros' })}
      </button>
      <a href={threadKind === 'dm' && dmOther ? `/u/?h=${dmOther.handle}` : partnerHref}>{$t('mensagens.tools.partner_profile', { default: 'Perfil de {name}', values: { name: threadKind === 'dm' && dmOther ? (dmOther.display_name || `@${dmOther.handle}`) : partnerName } })}</a>
    </nav>

    {#if panelMode === 'conversations'}
      <aside class="chat-panel" aria-label={$t('mensagens.conversations.title', { default: 'Conversas' })}>
        <div class="panel-head">
          <strong>{$t('mensagens.conversations.title', { default: 'Conversas' })}</strong>
          <button type="button" onclick={() => (panelMode = 'none')} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>×</button>
        </div>
        <div class="conversation-list">
          {#each CONVERSATIONS as c}
            <button type="button" class:active={selectedConversationId === c.id} onclick={() => selectConversation(c.id)}>
              <span class="conv-icon" aria-hidden="true">{c.icon}</span>
              <span>
                <strong>{$t(c.titleKey)}</strong>
                <small>{conversationPreview(c.id)}</small>
              </span>
            </button>
          {/each}
        </div>
      </aside>
    {:else if panelMode === 'files'}
      <aside class="chat-panel" aria-label={$t('mensagens.files.title', { default: 'Ficheiros' })}>
        <div class="panel-head">
          <strong>{$t('mensagens.files.title', { default: 'Ficheiros' })}</strong>
          <button type="button" onclick={() => (panelMode = 'none')} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>×</button>
        </div>
        {#if fileMessages.length === 0}
          <p class="panel-empty">{$t('mensagens.files.empty', { default: 'Ainda não há ficheiros nesta conversa.' })}</p>
        {:else}
          <div class="file-grid">
            {#each fileMessages as m (m.id)}
              {@const src = store?.mediaSrc(m)}
              {#if m.mediaType?.startsWith('image/')}
                <button type="button" class="file-card" onclick={() => (src ? (viewerSrc = src) : undefined)}>
                  <span aria-hidden="true">🖼️</span>
                  <strong>{m.name || $t('mensagens.files.image')}</strong>
                  <small>{fmtTime(m.ts)}</small>
                </button>
              {:else if src}
                <a class="file-card" href={src} target="_blank" rel="noreferrer" download={m.name || undefined}>
                  <span aria-hidden="true">{m.mediaType?.startsWith('audio/') ? '🎧' : m.mediaType?.startsWith('video/') ? '🎬' : '📎'}</span>
                  <strong>{m.name || (m.mediaType?.startsWith('audio/') ? $t('mensagens.files.audio') : m.mediaType?.startsWith('video/') ? $t('mensagens.files.video', { default: 'Vídeo' }) : $t('mensagens.files.file'))}</strong>
                  <small>{fmtTime(m.ts)}</small>
                </a>
              {/if}
            {/each}
          </div>
        {/if}
      </aside>
    {/if}
  {/if}

  {#if store?.offline && !syncBlocked && view === 'thread'}
    <div class="offline-banner" role="status">
      {$t('mensagens.offline', {
        default: 'Sem ligação — as mensagens ficam guardadas e seguem quando houver rede.'
      })}
    </div>
  {/if}

  {#if syncBlocked && !noSession && view === 'thread'}
    <div class="sync-banner" role="status">
      <div>
        <strong>{$t('mensagens.secure_setup.title', { default: 'Chat privado ainda não está sincronizado neste dispositivo' })}</strong>
        <p>{$t('mensagens.secure_setup.body', { default: 'Podes escrever já; fica guardado localmente. Para sincronizar entre telemóveis, é preciso activar a ligação segura uma vez.' })}</p>
      </div>
      <details bind:open={setupOpen}>
        <summary>{$t('mensagens.secure_setup.action', { default: 'Activar ligação segura' })}</summary>
        <div class="setup-form">
          <input
            type="text"
            bind:value={setupKeyInput}
            placeholder={$t('mensagens.secure_setup.placeholder', { default: 'Chave de ligação' })}
            autocomplete="off"
            onkeydown={(e) => {
              if (e.key === 'Enter') saveSecureKey();
            }}
          />
          <button type="button" class="gate-save" onclick={saveSecureKey}>
            {$t('mensagens.secure_setup.save', { default: 'Activar' })}
          </button>
        </div>
        <p class="setup-note">{$t('mensagens.secure_setup.note', { default: 'Esta chave é técnica. Não é uma barreira entre vocês; é só a protecção do endpoint privado.' })}</p>
      </details>
    </div>
  {/if}

  {#if store && view === 'thread'}
    <div class="chat-scroll" bind:this={scrollEl} onscroll={onListScroll}>
      {#if richStore?.hasOlder && store.messages.length > 0 && !searchQuery}
        <button type="button" class="load-older" disabled={richStore.loadingOlder} onclick={() => void richStore.loadOlder()}>
          {richStore.loadingOlder
            ? $t('mensagens.history.loading', { default: 'A carregar…' })
            : $t('mensagens.history.older', { default: 'Carregar mensagens anteriores' })}
        </button>
      {/if}
      {#if store.ready && store.messages.length === 0}
        <div class="empty">
          <span class="empty-heart" aria-hidden="true">💌</span>
          <p class="empty-title">{$t('mensagens.empty', { default: 'Ainda não há mensagens aqui.' })}</p>
          <p class="empty-hint">
            {threadKind === 'dm'
              ? $t('mensagens.empty_hint_dm', { default: 'Diz olá! 👋' })
              : $t('mensagens.empty_hint', { default: 'Deixa uma nota, envia uma foto ou grava um áudio quando quiseres.' })}
          </p>
        </div>
      {:else if searchQuery && groups.length === 0}
        <div class="empty compact">
          <span class="empty-heart" aria-hidden="true">🔎</span>
          <p class="empty-title">{$t('mensagens.search.empty', { default: 'Não encontrei essa mensagem.' })}</p>
        </div>
      {/if}

      {#each groups as g (g.key)}
        <div class="day-sep" role="separator">
          <span>
            {#if g.kind === 'today'}{$t('mensagens.hoje', { default: 'Hoje' })}
            {:else if g.kind === 'yesterday'}{$t('mensagens.ontem', { default: 'Ontem' })}
            {:else}{fmtDate(g.date)}{/if}
          </span>
        </div>
        {#each g.items as m (m.id)}
          {@const own = m.from === store.profile}
          <div class="msg" class:msg-own={own} class:msg-other={!own} class:msg-system={m.kind === 'call'} data-message-id={m.id}>
            <div class="bubble" class:bubble-own={own} class:pop={own} class:bubble-call={m.kind === 'call'} class:bubble-deleted={m.deleted}>
              {#if m.starred}<span class="star-mark" title={$t('mensagens.message.starred', { default: 'Marcada' })}>★</span>{/if}
              {#if m.reply}
                <button type="button" class="reply-quote" onclick={() => jumpToMessage(m.reply?.id ?? '')}>
                  <strong>{$t('mensagens.message.reply', { default: 'Resposta' })}</strong>
                  <span>{replyLabel({ text: m.reply.text, kind: m.reply.kind, deleted: m.reply.deleted })}</span>
                </button>
              {/if}
              {#if m.deleted}
                <div class="deleted-copy">🚫 {$t('mensagens.message.deleted', { default: 'Mensagem apagada' })}</div>
              {:else if m.kind === 'call'}
                <div class="call-event">
                  <span class="call-event-icon" aria-hidden="true">{m.call?.kind === 'video' ? '🎥' : '📞'}</span>
                  <span class="call-event-copy">
                    <strong>{callHistoryLabel(m)}</strong>
                    {#if callDuration(m)}
                      <small>{$t('mensagens.call.duration', { default: 'Duração {time}', values: { time: callDuration(m) ?? '' } })}</small>
                    {/if}
                  </span>
                </div>
              {:else if m.mediaType?.startsWith('image/')}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <button
                    type="button"
                    class="img-btn"
                    onclick={() => (viewerSrc = src)}
                    aria-label={$t('mensagens.aria.abrir_imagem', { default: 'Abrir imagem em ecrã inteiro' })}
                  >
                    <img {src} alt={m.name || $t('mensagens.image_alt', { default: 'Imagem enviada' })} loading="lazy" />
                  </button>
                {:else}
                  <div class="media-loading">📷 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {:else if m.mediaType?.startsWith('audio/')}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <audio controls {src} aria-label={$t('mensagens.audio_label', { default: 'Mensagem de voz' })}></audio>
                {:else}
                  <div class="media-loading">🎧 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {:else if m.mediaType?.startsWith('video/')}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video controls playsinline preload="metadata" {src} aria-label={$t('mensagens.video_label', { default: 'Vídeo enviado' })}></video>
                {:else}
                  <div class="media-loading">🎬 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {:else if m.kind === 'file' || (m.mediaType && !m.mediaType.startsWith('image/') && !m.mediaType.startsWith('audio/') && !m.mediaType.startsWith('video/'))}
                {@const src = store.mediaSrc(m)}
                {#if src}
                  <a class="document-card" href={src} target="_blank" rel="noreferrer" download={m.name || undefined}>
                    <span aria-hidden="true">📄</span>
                    <span><strong>{m.name || $t('mensagens.files.file', { default: 'Ficheiro' })}</strong><small>{formatFileSize(m.mediaSize)}</small></span>
                    <span aria-hidden="true">↗</span>
                  </a>
                {:else}
                  <div class="media-loading">📎 {$t('mensagens.media_loading', { default: 'a carregar…' })}</div>
                {/if}
              {/if}
              {#if m.text && m.kind !== 'call' && !m.deleted}
                <div class="text">{m.text}</div>
              {/if}
              <div class="meta-row">
                <span class="time">{fmtTime(m.ts)}</span>
                {#if m.editedAt}<span class="edited">{$t('mensagens.message.edited', { default: 'editada' })}</span>{/if}
                {#if own}
                  {#if m.pending}
                    <span class="ticks" aria-label={$t('mensagens.aria.pendente', { default: 'A enviar…' })}>🕓</span>
                  {:else if m.queued}
                    <span class="ticks" aria-label={$t('mensagens.aria.na_fila', { default: 'Na fila para enviar' })}>🕓</span>
                  {:else if m.failed}
                    <button type="button" class="retry" onclick={() => retry(m.id)}>
                      ⚠️ {$t('mensagens.retry', { default: 'Tentar de novo' })}
                    </button>
                  {:else if store.otherLastRead >= m.ts}
                    <span class="ticks read" aria-label={$t('mensagens.aria.lida', { default: 'Lida' })}>✓✓</span>
                  {:else}
                    <span class="ticks" aria-label={$t('mensagens.aria.enviada', { default: 'Enviada' })}>✓</span>
                  {/if}
                {/if}
              </div>
              {#if m.reactions?.length}
                <div class="reaction-summary" aria-label={$t('mensagens.message.reactions', { default: 'Reações' })}>
                  {#each m.reactions as reaction (reaction.emoji)}
                    <button
                      type="button"
                      class:mine={reaction.reactedByMe}
                      onclick={() => void reactTo(m, reaction.emoji)}
                      aria-label={`${reaction.emoji} ${reaction.count}`}
                    >{reaction.emoji} <span>{reaction.count}</span></button>
                  {/each}
                </div>
              {/if}
              {#if richStore && !m.pending && !m.failed && m.kind !== 'call'}
                <button
                  type="button"
                  class="message-menu-trigger"
                  onclick={() => (messageMenuId = messageMenuId === m.id ? null : m.id)}
                  aria-label={$t('mensagens.message.actions', { default: 'Ações da mensagem' })}
                >⋯</button>
                {#if messageMenuId === m.id}
                  <div class="message-menu" role="menu">
                    {#if !m.deleted}
                      <div class="reaction-picker" aria-label={$t('mensagens.message.react', { default: 'Reagir' })}>
                        {#each REACTIONS as emoji}
                          <button type="button" onclick={() => void reactTo(m, emoji)} aria-label={emoji}>{emoji}</button>
                        {/each}
                      </div>
                      <button type="button" onclick={() => beginReply(m)}>↩ {$t('mensagens.message.reply', { default: 'Responder' })}</button>
                      {#if m.text}<button type="button" onclick={() => void copyMessage(m)}>⧉ {$t('mensagens.message.copy', { default: 'Copiar' })}</button>{/if}
                      <button type="button" onclick={() => void toggleStar(m)}>{m.starred ? '☆' : '★'} {m.starred ? $t('mensagens.message.unstar', { default: 'Desmarcar' }) : $t('mensagens.message.star', { default: 'Marcar' })}</button>
                    {/if}
                    {#if own && m.text && !m.deleted}<button type="button" onclick={() => beginEdit(m)}>✎ {$t('mensagens.message.edit', { default: 'Editar' })}</button>{/if}
                    {#if own && !m.deleted}<button type="button" class="danger" onclick={() => void deleteRichMessage(m)}>⌫ {$t('mensagens.message.delete', { default: 'Apagar' })}</button>{/if}
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      {/each}
      {#if richStore?.otherTyping && !searchQuery}
        <div class="typing-bubble" role="status" aria-label={$t('mensagens.presence.typing', { default: 'a escrever…' })}>
          <span></span><span></span><span></span>
        </div>
      {/if}
    </div>

    {#if showJumpToEnd}
      <button
        type="button"
        class="jump-to-end"
        onclick={() => {
          showJumpToEnd = false;
          void scrollToBottom();
        }}
        aria-label={$t('chat.jump_to_end', { default: 'Ir para a última mensagem' })}
        title={$t('chat.jump_to_end', { default: 'Ir para a última mensagem' })}
      >
        <span aria-hidden="true">↓</span>
      </button>
    {/if}

    <div class="composer-dock" style={`--keyboard-inset: ${keyboardInset}px`}>
      {#if recording}
        <div class="recording-hint" role="status">
          {$t('mensagens.recording', { default: 'A gravar… toca no botão para parar 🎙️' })}
        </div>
      {/if}
      {#if replyingTo || editingMessage}
        <div class="compose-context">
          <span aria-hidden="true">{editingMessage ? '✎' : '↩'}</span>
          <span>
            <strong>{editingMessage ? $t('mensagens.message.editing', { default: 'A editar mensagem' }) : $t('mensagens.message.replying', { default: 'A responder' })}</strong>
            <small>{replyLabel(editingMessage ?? replyingTo ?? {})}</small>
          </span>
          <button type="button" onclick={cancelComposeMode} aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}>×</button>
        </div>
      {/if}
      <div class="composer">
        <input type="file" bind:this={fileInput} onchange={onFileChosen} hidden accept={richStore ? 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip' : 'image/*,audio/*'} />
        <div class="input-shell">
          {#if threadKind === 'couple' || richStore}
            <button
              type="button"
              class="attach-btn"
              onclick={() => fileInput?.click()}
              aria-label={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
              title={$t('a11y.aria.anexar_ficheiro', { default: 'Anexar ficheiro' })}
            >
              📎
            </button>
          {/if}
          <textarea
            bind:this={inputEl}
            bind:value={input}
            onkeydown={onKeydown}
            oninput={autogrow}
            onblur={() => richStore?.setTyping(false)}
            placeholder={editingMessage ? $t('mensagens.message.edit_placeholder', { default: 'Edita a mensagem…' }) : $t('mensagens.placeholder', { default: 'Escreve uma mensagem…' })}
            maxlength="4000"
            rows="1"
          ></textarea>
        </div>
        <button
          type="button"
          class="action-btn"
          class:recording
          onclick={() => (input.trim() ? void send() : void toggleRecording())}
          aria-label={input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
          title={input.trim()
            ? $t('a11y.aria.enviar', { default: 'Enviar' })
            : recording
              ? $t('agente.aria.parar_gravacao', { default: 'Parar gravação' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
        >
          {#if input.trim()}➤{:else if recording}⏹️{:else}🎤{/if}
        </button>
      </div>
    </div>
    {/if}
  {:else}
    <div class="gate card">
      <span class="gate-emoji" aria-hidden="true">🔐</span>
      <p>{$t('mensagens.no_session', { default: 'Abre primeiro a tua sessão no ecrã inicial para entrares no chat privado.' })}</p>
    </div>
  {/if}
</div>

{#if viewerSrc}
  <div class="viewer" role="dialog" aria-modal="true">
    <button
      type="button"
      class="viewer-backdrop"
      onclick={() => (viewerSrc = null)}
      aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
    ></button>
    <img class="viewer-img" src={viewerSrc} alt={$t('mensagens.image_alt', { default: 'Imagem enviada' })} />
    <button
      type="button"
      class="viewer-close"
      onclick={() => (viewerSrc = null)}
      aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
    >
      ✕
    </button>
  </div>
{/if}

<style>
  .chat-root {
    /* V10.2 — layout WhatsApp: altura FIXA ao viewport e overflow escondido,
       para a página nunca rolar. A lista (.chat-scroll) é o único scroller;
       o composer e o footer ficam sempre no sítio e a última mensagem está
       SEMPRE visível ao entrar, sem scroll manual. */
    display: flex;
    flex-direction: column;
    /* Preenche o espaço REAL que main/.route-transition entregam por flex
       (100dvh − header sticky − footer sticky) em vez de estimar alturas —
       os números mágicos antigos (69px + 4.75rem) variavam por dispositivo e
       criavam ora uma banda morta ora overflow que fazia o footer deslizar.
       Mesmo padrão do /agente. */
    flex: 1;
    min-height: 0;
    width: 100%;
    overflow: hidden;
    max-width: 800px;
    margin: 0 auto;
    color: var(--txt);
  }
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .back-btn {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: 1.6rem;
    font-weight: 900;
    cursor: pointer;
  }
  .back-btn:hover,
  .back-btn:focus-visible { background: color-mix(in srgb, var(--accent) 14%, transparent); outline: none; }
  .header-text { min-width: 0; flex: 1; }

  /* ── WhatsApp-style conversation list ── */
  .chat-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .chat-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    text-align: start;
    cursor: pointer;
    color: var(--txt);
  }
  .chat-row:hover,
  .chat-row:focus-visible { background: color-mix(in srgb, var(--accent) 8%, transparent); outline: none; }
  .row-av {
    flex: 0 0 auto;
    width: 52px;
    height: 52px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 1.6rem;
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-elev));
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  }
  .chat-row.couple .couple-av {
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 30%, transparent), color-mix(in srgb, #a78bfa 30%, transparent));
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .row-body { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .row-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
  .row-top strong { font-size: var(--fs-md); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-top time { flex: 0 0 auto; font-size: var(--fs-xs); color: var(--txt3); }
  .row-meta { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 0.35rem; }
  .unread-badge {
    min-width: 1.25rem;
    height: 1.25rem;
    display: inline-grid;
    place-items: center;
    padding-inline: 0.28rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1;
  }
  .row-body small {
    color: var(--txt3);
    font-size: var(--fs-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chat-row.couple { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .couple-heart { font-size: 0.9em; }
  .req-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
    font-size: var(--fs-sm);
    font-weight: 800;
    text-decoration: none;
  }
  .req-banner:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .list-section {
    margin: var(--space-3) var(--space-4) 0;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--txt3);
  }
  .list-hint {
    margin: var(--space-2) var(--space-4);
    color: var(--txt3);
    font-size: var(--fs-sm);
    line-height: 1.4;
  }
  .find-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: var(--space-3) var(--space-4);
    padding: var(--space-3);
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    color: var(--txt2);
    font-weight: 700;
    text-decoration: none;
  }
  .find-row:hover { border-color: var(--accent); color: var(--accent); }
  .gate-cta { color: var(--accent); font-weight: 800; text-decoration: none; }
  .chat-header h1 {
    margin: 0;
    font-size: var(--fs-lg);
  }
  .person-link {
    color: inherit;
    text-decoration: none;
    border-radius: var(--radius-sm);
  }
  .person-link:hover,
  .person-link:focus-visible {
    color: var(--accent);
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .subtitle {
    margin: 0.15rem 0 0;
    font-size: var(--fs-xs);
    color: var(--txt3);
  }
  .chat-kicker {
    display: block;
    margin-bottom: 0.15rem;
    color: var(--txt3);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .profile-link {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    color: inherit;
    text-decoration: none;
    font-size: 1.35rem;
    flex-shrink: 0;
  }
  .profile-link:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }
  .header-action {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    border: 0;
    background: transparent;
    color: var(--txt2);
    cursor: pointer;
    font-size: 1rem;
  }
  .header-action:hover,
  .header-action.active,
  .header-action:focus-visible {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
    outline: none;
  }
  .chat-search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
  }
  .chat-search input {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--txt);
    padding: 0 var(--space-3);
    font: inherit;
  }
  .chat-search button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--txt2);
    cursor: pointer;
    font-size: 1.25rem;
  }
  .chat-tools {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding: var(--space-2) var(--space-4) 0;
  }
  .chat-tools button,
  .chat-tools a {
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--txt2);
    padding: 0.45rem 0.8rem;
    text-decoration: none;
    font: inherit;
    font-size: var(--fs-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  .chat-tools .active,
  .chat-tools button:hover,
  .chat-tools a:hover,
  .chat-tools button:focus-visible,
  .chat-tools a:focus-visible {
    color: var(--txt);
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
    outline: none;
  }
  .chat-panel {
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    box-shadow: var(--shadow-md);
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .panel-head button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    cursor: pointer;
  }
  .conversation-list {
    display: grid;
    gap: var(--space-2);
  }
  .conversation-list button {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2);
    align-items: center;
    text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    color: inherit;
    padding: var(--space-2);
    cursor: pointer;
  }
  .conversation-list button.active {
    border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
    background: color-mix(in srgb, var(--accent) 14%, var(--bg-elev));
  }
  .conv-icon {
    width: 2.4rem;
    height: 2.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 1rem;
    background: var(--card);
  }
  .conversation-list small,
  .file-card small,
  .panel-empty {
    display: block;
    color: var(--txt3);
    line-height: 1.35;
  }
  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-2);
  }
  .file-card {
    min-height: 7rem;
    display: grid;
    justify-items: start;
    align-content: space-between;
    gap: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    color: inherit;
    padding: var(--space-3);
    text-align: left;
    cursor: pointer;
  }
  .file-card span {
    font-size: 1.5rem;
  }
  .sync-banner,
  .offline-banner {
    margin: var(--space-2) var(--space-4) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--txt2);
    font-size: var(--fs-sm);
    text-align: center;
  }

  /* ── session / secure setup states ── */
  .gate {
    margin: var(--space-6) var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
    background: var(--card);
    box-shadow: var(--shadow-md);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-items: center;
  }
  .gate-emoji {
    font-size: 2.4rem;
  }
  .gate p {
    margin: 0;
    color: var(--txt2);
    font-size: var(--fs-sm);
    line-height: 1.5;
    max-width: 34ch;
  }
  .setup-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    max-width: 320px;
  }
  .setup-form input {
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-strong);
    background: var(--bg-elev);
    color: var(--txt);
    font: inherit;
  }
  .setup-form input:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .gate-save {
    min-height: var(--touch-target);
    border: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: filter var(--motion-fast) ease, transform var(--motion-fast) ease;
  }
  .gate-save:hover {
    filter: brightness(1.08);
  }
  .gate-save:active {
    transform: scale(0.98);
  }
  .gate-save:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .sync-banner {
    display: grid;
    gap: var(--space-3);
    text-align: left;
  }
  .sync-banner p,
  .setup-note {
    margin: 0.25rem 0 0;
    line-height: 1.45;
  }
  .sync-banner details {
    width: 100%;
  }
  .sync-banner summary {
    cursor: pointer;
    color: var(--accent);
    font-weight: 700;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  .setup-form {
    margin-top: var(--space-2);
  }

  /* ── messages ── */
  .chat-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-4);
    /* Espaço para as bolhas nunca ficarem atrás do composer fixo + footer. */
    padding-bottom: calc(9rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .empty {
    text-align: center;
    padding: var(--space-6) var(--space-4) var(--space-3);
    color: var(--txt2);
  }
  .empty-heart {
    font-size: 2.6rem;
    display: block;
    margin-bottom: var(--space-2);
  }
  .empty-title {
    margin: 0;
    font-size: var(--fs-md);
    color: var(--txt);
    font-weight: 600;
  }
  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--fs-sm);
  }
  .empty.compact { padding-block: var(--space-4); }
  .load-older {
    align-self: center;
    min-height: 38px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--accent);
    padding: 0.35rem 0.9rem;
    font: inherit;
    font-size: var(--fs-xs);
    font-weight: 800;
    cursor: pointer;
  }
  .load-older:disabled { opacity: 0.6; cursor: wait; }
  .day-sep {
    display: flex;
    justify-content: center;
    margin: var(--space-3) 0 var(--space-1);
  }
  .day-sep span {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt3);
    font-size: var(--fs-xs);
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
  }
  .msg {
    display: flex;
    width: 100%;
  }
  .msg-own {
    justify-content: flex-end;
  }
  .msg-other {
    justify-content: flex-start;
  }
  .bubble {
    max-width: 78%;
    padding: 0.55rem 0.8rem 0.4rem;
    border-radius: 14px;
    line-height: 1.45;
    font-size: var(--fs-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--txt);
    border-bottom-left-radius: 4px;
    position: relative;
  }
  .bubble-own {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
    border-bottom-left-radius: 14px;
    border-bottom-right-radius: 4px;
  }
  .msg-system { justify-content: center; }
  .bubble-call {
    max-width: min(90%, 360px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 10%, var(--card));
    color: var(--txt2);
    border-color: color-mix(in srgb, var(--accent) 25%, var(--border));
    padding: 0.55rem 1rem;
  }
  .call-event { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
  .call-event-icon { font-size: 1.15rem; }
  .call-event-copy { display: grid; line-height: 1.2; }
  .call-event-copy strong { font-weight: 750; }
  .call-event-copy small { margin-top: 0.15rem; color: var(--txt3); font-size: var(--fs-xs); }
  .bubble-deleted { background: color-mix(in srgb, var(--card) 82%, transparent); color: var(--txt3); font-style: italic; }
  .deleted-copy { display: flex; align-items: center; gap: var(--space-1); }
  .star-mark {
    position: absolute;
    top: 0.25rem;
    inset-inline-end: 0.4rem;
    font-size: 0.68rem;
    opacity: 0.82;
  }
  .reply-quote {
    display: grid;
    width: 100%;
    gap: 0.1rem;
    margin-bottom: 0.4rem;
    padding: 0.38rem 0.55rem;
    border: 0;
    border-inline-start: 3px solid currentColor;
    border-radius: 0.45rem;
    background: rgb(255 255 255 / 0.14);
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  .bubble:not(.bubble-own) .reply-quote { background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .reply-quote strong { font-size: 0.7rem; opacity: 0.88; }
  .reply-quote span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); }
  /* Subtle pop on own bubbles. Runs only when the element mounts (keyed
     each) and is zeroed globally by the reduced-motion kill-switch. */
  @keyframes bubble-pop {
    from {
      transform: scale(0.92);
      opacity: 0.6;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .bubble.pop {
    animation: bubble-pop var(--motion-fast) ease-out;
    transform-origin: bottom right;
  }
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.3rem;
    margin-top: 0.15rem;
  }
  .time {
    font-size: 0.68rem;
    opacity: 0.75;
  }
  .edited { font-size: 0.64rem; opacity: 0.72; }
  .ticks {
    font-size: 0.72rem;
    opacity: 0.85;
    letter-spacing: -0.12em;
  }
  .bubble-own .ticks.read {
    color: var(--on-accent);
    opacity: 1;
    text-shadow: 0 0 6px currentColor;
  }
  .retry {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 999px;
    font-size: var(--fs-xs);
    padding: 0.15rem 0.55rem;
    min-height: 28px;
    cursor: pointer;
  }
  .retry:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .img-btn {
    display: block;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: zoom-in;
    border-radius: var(--radius-md);
    overflow: hidden;
    max-width: 100%;
  }
  .img-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .img-btn img {
    display: block;
    max-width: min(260px, 100%);
    max-height: 300px;
    border-radius: var(--radius-md);
  }
  .bubble audio {
    max-width: min(240px, 100%);
    display: block;
  }
  .bubble video {
    display: block;
    width: min(300px, 100%);
    max-height: 360px;
    border-radius: var(--radius-md);
    background: #000;
  }
  .document-card {
    min-width: min(250px, 68vw);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: rgb(255 255 255 / 0.14);
    color: inherit;
    text-decoration: none;
  }
  .document-card > span:nth-child(2) { display: grid; min-width: 0; }
  .document-card strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .document-card small { opacity: 0.75; }
  .reaction-summary {
    position: absolute;
    bottom: -0.85rem;
    inset-inline-start: 0.45rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    z-index: 2;
  }
  .reaction-summary button {
    min-height: 26px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    padding: 0.05rem 0.35rem;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }
  .reaction-summary button.mine { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, var(--bg-elev)); }
  .reaction-summary + .message-menu-trigger { margin-bottom: -0.2rem; }
  .message-menu-trigger {
    position: absolute;
    top: -0.75rem;
    inset-inline-end: -0.85rem;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt2);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--motion-fast) ease;
    z-index: 4;
  }
  .bubble:hover .message-menu-trigger,
  .message-menu-trigger:focus-visible { opacity: 1; }
  @media (hover: none), (pointer: coarse) {
    .message-menu-trigger { opacity: 0.72; }
  }
  .message-menu {
    position: absolute;
    top: 1.4rem;
    inset-inline-end: 0.25rem;
    z-index: 12;
    min-width: 185px;
    display: grid;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elev);
    color: var(--txt);
    box-shadow: var(--shadow-lg);
    white-space: normal;
  }
  .message-menu > button {
    min-height: 38px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    padding: 0.35rem 0.55rem;
    text-align: start;
    cursor: pointer;
  }
  .message-menu > button:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .message-menu > button.danger { color: var(--error); }
  .reaction-picker { display: flex; justify-content: space-between; gap: 0.1rem; padding: 0.2rem; border-bottom: 1px solid var(--border); }
  .reaction-picker button { width: 30px; height: 30px; border: 0; border-radius: 999px; background: transparent; cursor: pointer; }
  .reaction-picker button:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); transform: scale(1.14); }
  :global(.message-highlight) .bubble { animation: message-flash 1.2s ease; }
  @keyframes message-flash { 40% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 45%, transparent); } }
  .typing-bubble {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 0.22rem;
    min-width: 54px;
    padding: 0.65rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 14px 14px 14px 4px;
    background: var(--card);
  }
  .typing-bubble span { width: 6px; height: 6px; border-radius: 50%; background: var(--txt3); animation: typing-dot 1s ease-in-out infinite; }
  .typing-bubble span:nth-child(2) { animation-delay: 0.14s; }
  .typing-bubble span:nth-child(3) { animation-delay: 0.28s; }
  @keyframes typing-dot { 50% { transform: translateY(-3px); opacity: 0.55; } }
  .media-loading {
    font-size: var(--fs-xs);
    opacity: 0.8;
    padding: var(--space-2) 0;
  }

  /* ── composer dock — same geometry as /agente ── */
  .composer-dock {
    position: fixed;
    left: 50%;
    right: auto;
    /* V10.2: encostado MESMO ao footer (bottom-nav ≈ 4.35rem) — a barra de
       escrever vive colada ao fundo, como no WhatsApp. O gradiente ancora-a
       visualmente e tapa as bolhas que passam por trás ao rolar. */
    bottom: max(
      calc(4.95rem + env(safe-area-inset-bottom)),
      calc(var(--keyboard-inset, 0px) + 0.55rem)
    );
    transform: translateX(-50%);
    width: min(800px, calc(100vw - 0.75rem));
    z-index: 65;
    padding-top: 0.45rem;
    background: linear-gradient(to top, var(--bg, #1f2e4a) 72%, transparent);
  }
  /* V10.1 — "ir para o fim" FAB, floats above the composer while reading
     history. Same fixed geometry as the dock so they never overlap. */
  .jump-to-end {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: max(
      calc(10.5rem + env(safe-area-inset-bottom)),
      calc(var(--keyboard-inset, 0px) + 8rem)
    );
    z-index: 66;
    min-width: 44px;
    min-height: 44px;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    background: var(--card, #22314f);
    color: var(--txt, #fff);
    font-size: 1.2rem;
    cursor: pointer;
    box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.4));
    animation: jump-in var(--motion-base, 220ms) ease;
  }
  @keyframes jump-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
  .recording-hint {
    text-align: center;
    font-size: var(--fs-xs);
    color: var(--txt2);
    background: color-mix(in srgb, var(--bg-elev) 85%, transparent);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.8rem;
    margin: 0 auto 0.4rem;
    width: fit-content;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .compose-context {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    padding: 0.45rem 0.65rem;
    border: 1px solid var(--border);
    border-inline-start: 3px solid var(--accent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-elev) 94%, var(--accent) 6%);
    color: var(--txt);
  }
  .compose-context > span:nth-child(2) { min-width: 0; display: grid; }
  .compose-context strong { font-size: var(--fs-xs); color: var(--accent); }
  .compose-context small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt2); }
  .compose-context button { width: 34px; height: 34px; border: 0; border-radius: 999px; background: transparent; color: var(--txt2); cursor: pointer; font-size: 1.2rem; }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .input-shell {
    flex: 1;
    min-height: 52px;
    display: flex;
    align-items: flex-end;
    gap: var(--space-1);
    background: color-mix(in srgb, var(--bg-elev) 88%, transparent);
    border: 1px solid var(--border);
    border-radius: 1.25rem;
    padding: 0.3rem 0.4rem;
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    transition: border-color var(--motion-fast) ease, background var(--motion-fast) ease;
  }
  .input-shell:focus-within {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--bg-elev) 94%, var(--accent) 6%);
  }
  .attach-btn {
    background: transparent;
    border: 0;
    color: var(--txt2);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: 999px;
    font-size: 1.2rem;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .attach-btn:hover {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--txt);
  }
  .attach-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .composer textarea {
    flex: 1;
    resize: none;
    background: transparent;
    border: 0;
    color: var(--txt);
    padding: 0.72rem 0.45rem 0.58rem 0.1rem;
    font: inherit;
    max-height: 132px;
    min-height: var(--touch-target);
    line-height: 1.4;
  }
  .composer textarea:focus {
    outline: none;
  }
  .action-btn {
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    font-weight: 700;
    min-width: 48px;
    min-height: 48px;
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.18rem;
    box-shadow: var(--shadow-md);
    transition: transform var(--motion-fast) ease, filter var(--motion-fast) ease;
  }
  .action-btn:hover {
    filter: brightness(1.1);
  }
  .action-btn:active {
    transform: scale(0.94);
  }
  .action-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .action-btn.recording {
    background: var(--error);
  }

  /* ── fullscreen image viewer ── */
  .viewer {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .viewer-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: color-mix(in srgb, var(--bg) 30%, rgb(0 0 0 / 0.72));
    cursor: zoom-out;
  }
  .viewer-img {
    position: relative;
    max-width: 94vw;
    max-height: 88dvh;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    pointer-events: none;
  }
  .viewer-close {
    position: absolute;
    top: calc(env(safe-area-inset-top) + 0.75rem);
    right: 0.75rem;
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    font-size: 1.1rem;
    cursor: pointer;
  }
  .viewer-close:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
