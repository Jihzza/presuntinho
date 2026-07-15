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
   * - Read receipts: ✓ = accepted by the server, grey ✓✓ = synced by the
   *   other device, accent ✓✓ = the other person's read cursor passed the
   *   message. markRead only fires at the visible conversation tail.
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
    updateAccountChatPreferences,
    type AccountChatInboxItem
  } from '$lib/chat/account-chat-store.svelte';
  import {
    chatCallDirection,
    formatFileSize,
    replyLabel,
    type ChatCallDirection,
    type ChatCallMeta
  } from '$lib/chat/account-chat-model';
  import { parseChatDeepLink, type ChatDeepLink } from '$lib/chat/chat-deep-link';
  import {
    accountChatVoiceDraftKey,
    getAccountChatPersistence,
    type AccountChatVoiceDraft
  } from '$lib/chat/account-chat-outbox';
  import {
    canEditChatMessage,
    copyTextToClipboard,
    messageDeliveryState,
    shouldClearVoiceDraft,
    shouldMarkConversationRead,
    type MessageDeliveryState
  } from '$lib/chat/message-actions';
  import {
    chatDraftPreview,
    chatDraftText,
    readChatDrafts,
    withoutConfirmedChatDraft,
    withChatDraft,
    writeChatDrafts,
    type ChatDraft
  } from '$lib/chat/message-drafts';
  import {
    announceChatPreferencesChanged,
    compareConversationPreference,
    isConversationMuted,
    mutedUntilFor,
    withConversationPreference,
    type ConversationMuteMode,
    type ConversationPreferencePatch
  } from '$lib/chat/conversation-preferences';
  import {
    formatVoiceDuration,
    normalizeVoiceMime,
    preferredVoiceMime,
    voiceFileName
  } from '$lib/chat/voice-recorder';
  import { profileFor } from '$lib/profile/people';
  import { couple } from '$lib/couple/couple-store.svelte';
  import { accountState, startAccountSync } from '$lib/account/account-store.svelte';
  import { listContacts, listIncoming, subscribeConnections, type Contact } from '$lib/account/contacts';
  import { listSpaces, singleActiveCouple, otherMember } from '$lib/account/spaces';
  import Avatar from '$lib/components/Avatar.svelte';
  import CallButtons from '$lib/calls/CallButtons.svelte';
  import CallStartAction from '$lib/calls/CallStartAction.svelte';
  import type { CallStartBlockReason } from '$lib/calls/call-start-state';

  type ConversationPreset = {
    id: string;
    titleKey: string;
    icon: string;
    descKey: string;
  };

  type PanelMode = 'none' | 'conversations' | 'files';

  type AccountConversationListRow =
    | { key: string; kind: 'couple'; preset: ConversationPreset; inbox: AccountChatInboxItem | null }
    | { key: string; kind: 'dm'; contact: Contact; inbox: AccountChatInboxItem | null };

  const REACTIONS = ['❤️', '😂', '🥰', '😮', '😢', '👍'];

  const CONVERSATIONS: ConversationPreset[] = [
    { id: 'main', titleKey: 'mensagens.conversations.main', icon: '💬', descKey: 'mensagens.conversations.main_desc' },
    { id: 'memories', titleKey: 'mensagens.conversations.memories', icon: '🗂️', descKey: 'mensagens.conversations.memories_desc' },
    { id: 'photos', titleKey: 'mensagens.conversations.photos', icon: '📷', descKey: 'mensagens.conversations.photos_desc' },
    { id: 'plans', titleKey: 'mensagens.conversations.plans', icon: '📝', descKey: 'mensagens.conversations.plans_desc' },
    { id: 'voice', titleKey: 'mensagens.conversations.voice', icon: '🎙️', descKey: 'mensagens.conversations.voice_desc' }
  ];

  const SELECTED_CONVERSATION_KEY = 'presuntinho-mensagens-selected-conversation';
  const voiceDraftPersistence = getAccountChatPersistence();

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
  let showArchived = $state(false);
  let conversationActionBusy = $state<string | null>(null);
  // Couple partner shown on the couple row/header: legacy persona OR the
  // account partner from the active couple space (fixes the fatma/daniel
  // fallback leaking into account couples).
  let acctPartner = $state<{ id: string; label: string; emoji: string; handle: string } | null>(null);
  let acctCoupleId = $state<string | null>(null);
  let legacy = $state(true);
  let unsubConn: (() => void) | null = null;

  let input = $state('');
  let recording = $state(false);
  let voicePreparing = $state(false);
  let voiceFinalizing = $state(false);
  let voiceSending = $state(false);
  let recordingElapsedMs = $state(0);
  let voiceAnnouncement = $state('');
  let voiceDraft = $state<{
    blob: Blob;
    url: string;
    fileName: string;
    durationMs: number;
    replyToId?: string;
    accountId?: string;
    conversationId?: string;
  } | null>(null);
  let keyboardInset = $state(0);
  let pageActive = $state(true);
  let viewerSrc = $state<string | null>(null);
  let searchOpen = $state(false);
  let searchQuery = $state('');
  let replyingTo = $state<LocalChatMessage | null>(null);
  let editingMessage = $state<LocalChatMessage | null>(null);
  let messageMenuId = $state<string | null>(null);
  let messageInfo = $state<LocalChatMessage | null>(null);
  let messageActionAnnouncement = $state('');
  let drafts = $state<ChatDraft[]>([]);
  let draftScopeId = $state<string | null>(null);
  let draftStorageWarningShown = false;
  let lastCount = 0;
  let showJumpToEnd = $state(false);
  let readAtBottom = $state(false);
  let scrollConversationKey = '';
  let accountUiId: string | null = null;
  let accountLifecycleSeen = false;
  let accountSocialReady = $state(false);
  let handledDeepLinkKey = '';

  let scrollEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let fileInput: HTMLInputElement | null = $state(null);
  let messageInfoDialogEl: HTMLDivElement | null = $state(null);
  let messageInfoCloseEl: HTMLButtonElement | null = $state(null);
  let messageInfoReturnFocus: HTMLElement | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordingChunks: BlobPart[] = [];
  let recordingStream: MediaStream | null = null;
  let recordingStartedAt = 0;
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let recordingGeneration = 0;
  let recordingStopMode: 'preview' | 'discard' = 'preview';
  let inboxPollTimer: ReturnType<typeof setInterval> | null = null;
  let voiceDraftRestoreSequence = 0;
  let voiceDraftRestoredScope = '';
  let voiceDraftStorageWarningShown = false;
  let pendingDeepLinkMessage = $state<{ conversationId: string; messageId: string } | null>(null);

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
    const accountSearchStore = store instanceof AccountChatStore ? store : null;
    const usingServerSearch = Boolean(needle && accountSearchStore && !accountSearchStore.searchError);
    const source = usingServerSearch ? accountSearchStore?.searchResults ?? [] : store.messages;
    const visible = needle && !usingServerSearch
      ? source.filter((m) =>
          [m.text, m.name, m.reply?.text].some((value) => value?.toLocaleLowerCase($locale || 'pt-PT').includes(needle))
        )
      : source;
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
  const callSurfaceDisabledReason = $derived.by<CallStartBlockReason | null>(() => {
    if (!richStore) return 'call_account_not_ready';
    if (richStore.offline) return 'call_offline';
    if (!richStore.ready) return 'call_account_not_ready';
    return null;
  });
  // Couple surface lights up for the legacy pair AND active account couples.
  const canCouple = $derived(couple.available);
  // Partner identity for the couple thread, by session kind.
  const partnerName = $derived(legacy ? $t(otherPerson.nameKey) : (acctPartner?.label ?? '💞'));
  const partnerEmoji = $derived(legacy ? otherPerson.emoji : (acctPartner?.emoji ?? '💞'));
  const partnerHref = $derived(legacy ? `/perfil/${other}/` : acctPartner ? `/u/?h=${acctPartner.handle}` : '/contactos/');
  const meEmoji = $derived(legacy ? meProfile.emoji : (accountState.account?.emoji ?? '🙂'));
  const meHref = $derived(legacy ? '/perfil/' : '/conta/');
  const selectedConversation = $derived(CONVERSATIONS.find((c) => c.id === selectedConversationId) ?? CONVERSATIONS[0]);
  const fileMessages = $derived(
    richStore
      ? richStore.mediaItems
      : (store?.messages ?? []).filter((m) => !m.deleted && Boolean(m.mediaType || m.mediaKey || m.localDataUrl))
  );
  const accountConversationRows = $derived.by<AccountConversationListRow[]>(() => {
    if (legacy) return [];
    const rows: AccountConversationListRow[] = [
      ...(canCouple
        ? CONVERSATIONS.map((preset) => ({
            key: `couple:${preset.id}`,
            kind: 'couple' as const,
            preset,
            inbox: coupleInboxItem(preset.id)
          }))
        : []),
      ...dmContacts.map((contact) => ({
        key: `dm:${contact.id}`,
        kind: 'dm' as const,
        contact,
        inbox: dmInboxItem(contact.id)
      }))
    ];

    return rows
      .filter((row) => Boolean(row.inbox?.archivedAt) === showArchived)
      .sort((a, b) =>
        compareConversationPreference(
          {
            conversationId: a.inbox?.conversationId ?? a.key,
            lastMessageAt: a.inbox?.lastMessageAt ?? 0,
            pinnedAt: a.inbox?.pinnedAt ?? 0,
            mutedUntil: a.inbox?.mutedUntil ?? 0,
            archivedAt: a.inbox?.archivedAt ?? 0
          },
          {
            conversationId: b.inbox?.conversationId ?? b.key,
            lastMessageAt: b.inbox?.lastMessageAt ?? 0,
            pinnedAt: b.inbox?.pinnedAt ?? 0,
            mutedUntil: b.inbox?.mutedUntil ?? 0,
            archivedAt: b.inbox?.archivedAt ?? 0
          }
        )
      );
  });
  const archivedConversationCount = $derived(
    accountInbox.filter((item) =>
      item.archivedAt > 0 && (
        (item.kind === 'couple' && CONVERSATIONS.some((preset) => preset.id === item.topic) && (!acctCoupleId || item.spaceId === acctCoupleId)) ||
        (item.kind === 'direct' && dmContacts.some((contact) => contact.id === item.otherAccount))
      )
    ).length
  );

  function coupleDraftKey(topic: string, spaceId: string | null = acctCoupleId): string | null {
    if (legacy) return `legacy:${topic}`;
    const coupleIdentity = spaceId ?? acctCoupleId ?? acctPartner?.id;
    return coupleIdentity ? `couple:${coupleIdentity}:${topic}` : null;
  }

  function directDraftKey(accountId: string | null | undefined): string | null {
    return accountId ? `direct:${accountId}:main` : null;
  }

  function currentDraftKey(): string | null {
    return threadKind === 'dm' ? directDraftKey(dmOther?.id) : coupleDraftKey(selectedConversationId);
  }

  function accountRowDraftKey(row: AccountConversationListRow): string | null {
    return row.kind === 'dm'
      ? directDraftKey(row.contact.id)
      : coupleDraftKey(row.preset.id, row.inbox?.spaceId ?? acctCoupleId);
  }

  function draftFor(key: string | null): string {
    return chatDraftText(drafts, key);
  }

  function draftLabel(text: string): string {
    return $t('mensagens.draft.preview', {
      default: 'Rascunho: {text}',
      values: { text: chatDraftPreview(text) }
    });
  }

  function accountRowPreview(row: AccountConversationListRow): string {
    const draft = draftFor(accountRowDraftKey(row));
    if (draft) return draftLabel(draft);
    if (row.kind === 'dm') return inboxPreview(row.inbox) ?? `@${row.contact.handle}`;
    return inboxPreview(row.inbox) ?? $t(row.preset.descKey);
  }

  function browserStorage(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }

  function loadDraftScope(accountId: string): void {
    draftScopeId = accountId;
    drafts = readChatDrafts(browserStorage(), accountId);
  }

  function persistDraft(key: string | null, text: string): void {
    if (!draftScopeId || !key) return;
    drafts = withChatDraft(drafts, key, text);
    if (writeChatDrafts(browserStorage(), draftScopeId, drafts) || draftStorageWarningShown) return;
    draftStorageWarningShown = true;
    showToast($t('mensagens.draft.storage_failed', {
      default: 'O rascunho fica aberto, mas este browser não o conseguiu guardar para depois.'
    }));
  }

  function persistCurrentDraft(): void {
    // The list view can keep a stopped thread/store around for previews. Never
    // associate that hidden textarea value with whichever row happens to be
    // selected next.
    if (editingMessage || view !== 'thread') return;
    persistDraft(currentDraftKey(), input);
  }

  function restoreCurrentDraft(): void {
    if (editingMessage) return;
    input = draftFor(currentDraftKey());
    void tick().then(autogrow);
  }

  function clearConfirmedDraft(key: string | null, submitted: string): void {
    if (!draftScopeId || !key) return;
    const next = withoutConfirmedChatDraft(drafts, key, submitted);
    if (next === drafts) return;
    drafts = next;
    if (writeChatDrafts(browserStorage(), draftScopeId, drafts) || draftStorageWarningShown) return;
    draftStorageWarningShown = true;
    showToast($t('mensagens.draft.storage_failed', {
      default: 'O rascunho fica aberto, mas este browser não o conseguiu guardar para depois.'
    }));
  }

  function conversationPreview(id: string): string {
    const draft = draftFor(coupleDraftKey(id));
    if (draft) return draftLabel(draft);
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

  function fmtDateTime(ts: number): string {
    try {
      return new Date(ts).toLocaleString($locale || 'pt-PT', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch {
      return new Date(ts).toISOString();
    }
  }

  function deliveryState(message: LocalChatMessage): MessageDeliveryState {
    return messageDeliveryState(
      message,
      store?.otherLastRead ?? 0,
      richStore?.otherLastDelivered ?? 0,
      richStore?.peerLastReadAt ?? '',
      richStore?.peerLastDeliveredAt ?? ''
    );
  }

  function deliveryStatusLabel(state: MessageDeliveryState): string {
    const defaults: Record<MessageDeliveryState, string> = {
      pending: 'A enviar…',
      queued: 'Na fila neste dispositivo',
      failed: 'Falhou',
      sent: 'Enviada para o servidor',
      delivered: 'Entregue no outro dispositivo',
      read: 'Lida'
    };
    return $t(`mensagens.info.status.${state}`, { default: defaults[state] });
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
    const direction = callDirection(call);
    const directionLabel = direction
      ? $t(`mensagens.call.direction.${direction}`, {
          default: direction === 'outgoing' ? 'Efetuada' : 'Recebida'
        })
      : null;
    return [kind, directionLabel, status].filter(Boolean).join(' · ');
  }

  function callDirection(call: ChatCallMeta | null | undefined): ChatCallDirection | null {
    const accountId = richStore?.profile ?? accountState.account?.id;
    return call && accountId ? chatCallDirection(call, accountId) : null;
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

  function toggleFilesPanel(): void {
    if (panelMode === 'files') {
      panelMode = 'none';
      return;
    }
    panelMode = 'files';
    if (richStore && !richStore.mediaLoaded) void richStore.loadMediaGallery();
  }

  function openExactChatDeepLink(deepLink: ChatDeepLink): boolean {
    pendingDeepLinkMessage = null;
    const linkedConversation = accountInbox.find((item) => item.conversationId === deepLink.conversationId);
    if (linkedConversation?.kind === 'direct') {
      const target = dmContacts.find((contact) => contact.id === linkedConversation.otherAccount);
      if (!target) return false;
      if (deepLink.messageId) {
        pendingDeepLinkMessage = { conversationId: deepLink.conversationId, messageId: deepLink.messageId };
      }
      openDm(target);
      return true;
    }
    if (linkedConversation?.kind === 'couple' && CONVERSATIONS.some((item) => item.id === linkedConversation.topic)) {
      if (deepLink.messageId) {
        pendingDeepLinkMessage = { conversationId: deepLink.conversationId, messageId: deepLink.messageId };
      }
      selectConversation(linkedConversation.topic);
      return true;
    }
    return false;
  }

  function reportUnavailableDeepLink(): void {
    showToast($t('mensagens.deep_link.conversation_unavailable', {
      default: 'Não consegui abrir essa conversa neste momento.'
    }));
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
    readAtBottom = true;
    showJumpToEnd = false;
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
    persistCurrentDraft();
    resetVoiceComposer(false);
    replyingTo = null;
    editingMessage = null;
    store?.stop();
    threadKind = 'dm';
    dmOther = c;
    secureSetupNeeded = false;
    panelMode = 'none';
    view = 'thread';
    store = new AccountChatStore({ meId: accountState.account.id, peerId: c.id, kind: 'direct', topic: 'main' });
    store.start();
    restoreCurrentDraft();
    void scrollToBottom();
  }

  /** Contacts, requests and the couple partner for the list view. */
  async function refreshSocial(): Promise<void> {
    const accountId = accountState.account?.id;
    if (!accountId) return;
    try {
      const [cs, inc, spaces] = await Promise.all([listContacts(), listIncoming(), listSpaces()]);
      if (accountState.account?.id !== accountId) return;
      incomingReqs = inc;
      const active = singleActiveCouple(spaces);
      const partner = active ? otherMember(active, accountId) : null;
      acctCoupleId = active?.id ?? null;
      acctPartner = partner
        ? { id: partner.id, label: partner.display_name || `@${partner.handle}`, emoji: partner.emoji ?? '💞', handle: partner.handle }
        : null;
      // The couple partner lives on the pinned couple thread — not as a DM row.
      dmContacts = partner ? cs.filter((c) => c.id !== partner.id) : cs;
      await refreshInbox(accountId);
    } catch (e) {
      console.warn('[mensagens] social refresh failed', e);
    }
  }

  async function refreshInbox(expectedAccountId = accountState.account?.id): Promise<void> {
    if (legacy || !expectedAccountId || accountState.account?.id !== expectedAccountId) return;
    try {
      const next = await listAccountChatInbox();
      if (accountState.account?.id === expectedAccountId) accountInbox = next;
    } catch (error) {
      // Keep contacts usable during rolling deploys or a temporary network
      // failure; the open conversation store continues to recover separately.
      console.warn('[mensagens] inbox refresh failed', error);
    }
  }

  function closeConversationMenu(event: MouseEvent): void {
    (event.currentTarget as HTMLElement | null)?.closest('details')?.removeAttribute('open');
  }

  async function changeConversationPreference(
    item: AccountChatInboxItem,
    patch: ConversationPreferencePatch,
    successMessage: string,
    event: MouseEvent
  ): Promise<void> {
    const accountId = accountState.account?.id;
    if (!accountId || conversationActionBusy === item.conversationId) return;
    closeConversationMenu(event);

    const rollback: ConversationPreferencePatch = {};
    if (patch.pinnedAt !== undefined) rollback.pinnedAt = item.pinnedAt;
    if (patch.mutedUntil !== undefined) rollback.mutedUntil = item.mutedUntil;
    if (patch.archivedAt !== undefined) rollback.archivedAt = item.archivedAt;

    conversationActionBusy = item.conversationId;
    accountInbox = accountInbox.map((candidate) =>
      candidate.conversationId === item.conversationId
        ? withConversationPreference(candidate, patch)
        : candidate
    );
    if (patch.mutedUntil !== undefined) {
      announceChatPreferencesChanged({ conversationId: item.conversationId, mutedUntil: patch.mutedUntil });
    }

    if (patch.archivedAt === 0 && !accountInbox.some((candidate) => candidate.archivedAt > 0)) {
      showArchived = false;
    }

    try {
      await updateAccountChatPreferences(item.conversationId, accountId, patch);
      if (accountState.account?.id !== accountId) return;
      showToast(successMessage);
      await refreshInbox(accountId);
    } catch (error) {
      if (accountState.account?.id !== accountId) return;
      accountInbox = accountInbox.map((candidate) =>
        candidate.conversationId === item.conversationId
          ? withConversationPreference(candidate, rollback)
          : candidate
      );
      if (rollback.mutedUntil !== undefined) {
        announceChatPreferencesChanged({ conversationId: item.conversationId, mutedUntil: rollback.mutedUntil });
      }
      console.warn('[mensagens] conversation preference failed', error);
      showToast($t('mensagens.preferences.failed', {
        default: 'Não consegui guardar esta opção. Tenta novamente.'
      }));
    } finally {
      if (accountState.account?.id === accountId && conversationActionBusy === item.conversationId) {
        conversationActionBusy = null;
      }
    }
  }

  function toggleConversationPinned(item: AccountChatInboxItem, event: MouseEvent): void {
    const pinning = item.pinnedAt <= 0;
    void changeConversationPreference(
      item,
      { pinnedAt: pinning ? Date.now() : 0 },
      pinning
        ? $t('mensagens.preferences.pinned_toast', { default: 'Conversa fixada.' })
        : $t('mensagens.preferences.unpinned_toast', { default: 'Conversa desafixada.' }),
      event
    );
  }

  function setConversationMute(item: AccountChatInboxItem, mode: ConversationMuteMode, event: MouseEvent): void {
    const mutedUntil = mutedUntilFor(mode);
    const successMessage = mode === 'off'
      ? $t('mensagens.preferences.unmuted_toast', { default: 'Notificações desta conversa ligadas.' })
      : mode === 'forever'
        ? $t('mensagens.preferences.muted_forever_toast', { default: 'Conversa silenciada sempre.' })
        : $t('mensagens.preferences.muted_8h_toast', { default: 'Conversa silenciada durante 8 horas.' });
    void changeConversationPreference(item, { mutedUntil }, successMessage, event);
  }

  function toggleConversationArchived(item: AccountChatInboxItem, event: MouseEvent): void {
    const archiving = item.archivedAt <= 0;
    void changeConversationPreference(
      item,
      { archivedAt: archiving ? Date.now() : 0 },
      archiving
        ? $t('mensagens.preferences.archived_toast', { default: 'Conversa arquivada.' })
        : $t('mensagens.preferences.unarchived_toast', { default: 'Conversa retirada do arquivo.' }),
      event
    );
  }

  function selectConversation(id: string): void {
    persistCurrentDraft();
    resetVoiceComposer(false);
    replyingTo = null;
    editingMessage = null;
    selectedConversationId = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(SELECTED_CONVERSATION_KEY, id);
    panelMode = 'none';
    view = 'thread'; // WhatsApp-style: tapping a chat row opens its thread
    startChat();
    restoreCurrentDraft();
    void scrollToBottom();
  }

  /** WhatsApp-style back arrow: return from a thread to the conversation list. */
  function backToList(): void {
    persistCurrentDraft();
    resetVoiceComposer(false);
    panelMode = 'none';
    searchOpen = false;
    searchQuery = '';
    replyingTo = null;
    editingMessage = null;
    messageMenuId = null;
    messageInfo = null;
    messageInfoReturnFocus = null;
    messageActionAnnouncement = '';
    viewerSrc = null;
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
    loadDraftScope(session.profile);
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
        const startupAccountId = accountState.account.id;
        await refreshSocial();
        if (accountState.account?.id !== startupAccountId) return;
        const deepLink = parseChatDeepLink(page.url.searchParams);
        if (deepLink) handledDeepLinkKey = `${startupAccountId}:${deepLink.conversationId}:${deepLink.messageId}`;
        const linkedConversationOpened = deepLink ? openExactChatDeepLink(deepLink) : false;
        if (deepLink && !linkedConversationOpened) reportUnavailableDeepLink();
        accountSocialReady = true;
        if (!linkedConversationOpened && threadKind === 'couple') {
          startChat();
          restoreCurrentDraft();
        }
        unsubConn = subscribeConnections(() => void refreshSocial());
        inboxPollTimer = setInterval(() => {
          if (view === 'list' && document.visibilityState === 'visible') void refreshInbox();
        }, 10_000);
        const dmHandle = page.url.searchParams.get('dm');
        if (dmHandle && !linkedConversationOpened) {
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
      persistCurrentDraft();
      resetVoiceComposer(false);
      unsubConn?.();
      if (inboxPollTimer) clearInterval(inboxPollTimer);
      store?.stop();
    };
  });

  function clearAccountChatUi(): void {
    store?.stop();
    store = null;
    view = 'list';
    threadKind = 'couple';
    dmOther = null;
    dmContacts = [];
    incomingReqs = [];
    accountInbox = [];
    conversationActionBusy = null;
    acctPartner = null;
    acctCoupleId = null;
    input = '';
    replyingTo = null;
    editingMessage = null;
    messageMenuId = null;
    messageInfo = null;
    messageInfoReturnFocus = null;
    messageActionAnnouncement = '';
    viewerSrc = null;
    searchOpen = false;
    searchQuery = '';
    readAtBottom = false;
    accountSocialReady = false;
    handledDeepLinkKey = '';
    pendingDeepLinkMessage = null;
    resetVoiceComposer(false);
  }

  // A real-account logout/switch can happen while this route is mounted. Stop
  // account A before any asynchronous response is allowed to paint account B.
  $effect(() => {
    if (legacy || !accountState.ready) return;
    const liveAccountId = accountState.account?.id ?? null;
    if (!liveAccountId) {
      if (accountUiId || store instanceof AccountChatStore) clearAccountChatUi();
      accountUiId = null;
      drafts = [];
      draftScopeId = null;
      return;
    }
    if (liveAccountId === accountUiId) return;
    const isSwitch = accountLifecycleSeen;
    accountLifecycleSeen = true;
    if (isSwitch) clearAccountChatUi();
    accountUiId = liveAccountId;
    input = '';
    loadDraftScope(liveAccountId);
    restoreCurrentDraft();

    // Initial mount already owns its startup sequence. This branch is only for
    // an account that appears after a logout/switch while the page stays alive.
    if (isSwitch) {
      void (async () => {
        await refreshSocial();
        if (accountState.account?.id !== liveAccountId) return;
        startChat();
        accountSocialReady = true;
        unsubConn?.();
        unsubConn = subscribeConnections(() => void refreshSocial());
        if (inboxPollTimer) clearInterval(inboxPollTimer);
        inboxPollTimer = setInterval(() => {
          if (view === 'list' && document.visibilityState === 'visible') void refreshInbox(liveAccountId);
        }, 10_000);
      })();
    }
  });

  // A notification can navigate an already-mounted /mensagens page to a new
  // query string. Handle that exact target as well as the cold-start path.
  $effect(() => {
    const deepLink = parseChatDeepLink(page.url.searchParams);
    const accountId = accountState.account?.id ?? null;
    if (legacy || !accountId || !accountSocialReady || !deepLink) return;
    const key = `${accountId}:${deepLink.conversationId}:${deepLink.messageId}`;
    if (handledDeepLinkKey === key) return;
    handledDeepLinkKey = key;
    if (!openExactChatDeepLink(deepLink)) reportUnavailableDeepLink();
  });

  // A push/share link can target a message outside the newest page. Wait for
  // the exact conversation store to resolve its durable id, then load context
  // and move focus only once.
  $effect(() => {
    const pending = pendingDeepLinkMessage;
    const targetStore = richStore;
    if (
      !pending ||
      !targetStore?.ready ||
      targetStore.conversationId !== pending.conversationId
    ) return;
    pendingDeepLinkMessage = null;
    void jumpToMessage(pending.messageId, targetStore, true);
  });

  // Voice previews are restored only after the real conversation UUID exists;
  // logical list keys are never used as a persistence/security boundary.
  $effect(() => {
    const targetStore = richStore;
    const conversationId = targetStore?.conversationId;
    if (!targetStore?.ready || !conversationId || view !== 'thread') return;
    const scope = `${targetStore.profile}:${conversationId}`;
    if (voiceDraftRestoredScope === scope) return;
    voiceDraftRestoredScope = scope;
    const sequence = ++voiceDraftRestoreSequence;
    void restoreVoiceDraft(targetStore, conversationId, sequence);
  });

  // Auto-scroll when the conversation grows — but ONLY when the user was
  // already near the bottom (or on the initial load). Reading old messages
  // must never have the scroll stolen; the "ir para o fim" FAB appears
  // instead (V10.1).
  function isNearBottom(): boolean {
    // V10.2 — a lista é o scroller interno; a janela já não rola no chat.
    if (scrollEl) {
      return scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) < 180;
    }
    if (typeof window === 'undefined') return true;
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 180;
  }

  function isAtConversationTail(): boolean {
    if (scrollEl) {
      return scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) < 32;
    }
    if (typeof window === 'undefined') return false;
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 32;
  }

  function onListScroll(): void {
    readAtBottom = isAtConversationTail();
    showJumpToEnd = !isNearBottom() && (store?.messages.length ?? 0) > 0;
  }

  $effect(() => {
    const nextKey = store ? `${store.profile}:${store.conversationId}` : '';
    if (nextKey !== scrollConversationKey) {
      scrollConversationKey = nextKey;
      lastCount = 0;
      readAtBottom = false;
      showJumpToEnd = false;
    }
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

  // Read receipts require the real tail to be visible. The conversation list,
  // search results and a user reading history never acknowledge newer rows.
  $effect(() => {
    if (!store || !shouldMarkConversationRead({
      pageActive,
      threadVisible: view === 'thread',
      searchOpen,
      atBottom: readAtBottom
    })) return;
    if (store.unreadCount > 0) void store.markReadUpTo(store.latestIncomingTs);
  });

  // Account chat searches the complete server history. A short debounce keeps
  // typing responsive and each request is sequence-guarded inside the store.
  $effect(() => {
    const target = richStore;
    const query = searchOpen ? searchQuery.trim() : '';
    if (!target) return;
    if (!query) {
      target.clearSearch();
      return;
    }
    const timer = setTimeout(() => void target.searchMessages(query), 250);
    return () => clearTimeout(timer);
  });

  // ── sending ──────────────────────────────────────────────────────────────

  function autogrow(): void {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 132)}px`;
    richStore?.setTyping(Boolean(input.trim()) && !editingMessage);
  }

  function onComposerInput(): void {
    autogrow();
    if (!editingMessage) persistCurrentDraft();
  }

  function afterSendFeedback(result: 'sent' | 'queued' | 'failed'): void {
    if (result === 'queued') {
      showToast($t('mensagens.queued', { default: 'Guardada neste dispositivo — sincroniza quando a ligação segura estiver activa.' }));
    } else if (result === 'failed') {
      const storageError = richStore?.outboxStorageError;
      if (storageError === 'quota' || storageError === 'limit') {
        showToast($t('mensagens.outbox.quota', {
          default: 'O armazenamento deste browser está cheio. A mensagem não ficou guardada; liberta espaço e tenta novamente.'
        }));
      } else if (storageError === 'unavailable' || storageError === 'storage') {
        showToast($t('mensagens.outbox.unavailable', {
          default: 'Este browser não conseguiu guardar a mensagem offline. Mantém a app aberta ou tenta novamente com ligação.'
        }));
      } else {
        showToast($t('mensagens.send_failed', { default: 'A mensagem não seguiu. Toca em «tentar de novo».' }));
      }
    }
  }

  async function send() {
    const submittedInput = input;
    const text = submittedInput.trim();
    if (!text || !store) return;
    const targetStore = store;
    const targetRichStore = targetStore instanceof AccountChatStore ? targetStore : null;
    if (editingMessage && targetRichStore) {
      try {
        await targetRichStore.editMessage(editingMessage.id, text);
        if (store !== targetStore) return;
        editingMessage = null;
        restoreCurrentDraft();
        showToast($t('mensagens.message.edited_toast', { default: 'Mensagem editada.' }));
      } catch (error) {
        if (store !== targetStore) return;
        if (error instanceof AccountChatError && error.code === 'edit_expired') {
          editingMessage = null;
          persistCurrentDraft();
          showToast($t('mensagens.message.edit_expired', {
            default: 'Já passaram 15 minutos. O texto ficou no compositor para enviares como nova mensagem.'
          }));
          return;
        }
        showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
        return;
      }
    } else {
      const submittedDraftKey = currentDraftKey();
      // Keep the durable draft until the server confirms the optimistic
      // bubble. Programmatic clearing does not trigger textarea's oninput, so
      // a reload during the request still restores the unsent words.
      persistDraft(submittedDraftKey, submittedInput);
      input = '';
      playSfx('send');
      const result = targetRichStore
        ? await targetRichStore.sendTextMessage(text, replyingTo?.id)
        : await targetStore.sendTextMessage(text);
      if (store !== targetStore) return;
      if (result === 'sent' || result === 'queued') {
        clearConfirmedDraft(submittedDraftKey, submittedInput);
      } else if (submittedDraftKey === currentDraftKey() && !input) {
        input = submittedInput;
      }
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
    if (!file || !store || editingMessage) return;
    const targetStore = store;
    try {
      const result = targetStore instanceof AccountChatStore
        ? await targetStore.sendMediaMessage(file, file.name, replyingTo?.id)
        : await targetStore.sendMediaMessage(file, file.name);
      if (store !== targetStore) return;
      afterSendFeedback(result);
      replyingTo = null;
    } catch (err) {
      if (store !== targetStore) return;
      mediaErrorToast(err);
    }
    void scrollToBottom();
  }

  // ── voice composer ───────────────────────────────────────────────────────

  function clearRecordingTimer(): void {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = null;
  }

  function stopRecordingTracks(stream: MediaStream | null): void {
    for (const track of stream?.getTracks() ?? []) track.stop();
  }

  function clearVoiceDraft(): void {
    if (voiceDraft && typeof URL !== 'undefined') URL.revokeObjectURL(voiceDraft.url);
    voiceDraft = null;
  }

  function voiceDraftScope(
    draft = voiceDraft,
    targetStore: AccountChatStore | null = richStore
  ): { accountId: string; conversationId: string } | null {
    const accountId = draft?.accountId ?? targetStore?.profile;
    const conversationId = draft?.conversationId ?? targetStore?.conversationId;
    return accountId && conversationId ? { accountId, conversationId } : null;
  }

  function voiceStorageFeedback(key: 'save' | 'restore' | 'delete'): void {
    const defaults = {
      save: 'A gravação continua aberta, mas este browser não a conseguiu guardar para depois.',
      restore: 'Este browser não conseguiu recuperar a gravação guardada.',
      delete: 'A gravação saiu do ecrã, mas o browser não confirmou que a apagou do armazenamento.'
    } as const;
    const feedback = $t(`mensagens.voice.storage_${key}_failed`, { default: defaults[key] });
    voiceAnnouncement = feedback;
    showToast(feedback);
  }

  async function deletePersistedVoiceDraft(
    draft = voiceDraft,
    reportFailure = true
  ): Promise<boolean> {
    const scope = voiceDraftScope(draft);
    if (!scope) return true;
    try {
      await voiceDraftPersistence.deleteVoiceDraft(scope.accountId, scope.conversationId);
      return true;
    } catch (error) {
      console.warn('[mensagens] voice draft delete failed', error);
      if (reportFailure) voiceStorageFeedback('delete');
      return false;
    }
  }

  async function persistVoiceDraft(
    draft: NonNullable<typeof voiceDraft>,
    targetStore: AccountChatStore
  ): Promise<void> {
    const conversationId = targetStore.conversationId;
    if (!conversationId) {
      if (!voiceDraftStorageWarningShown) {
        voiceDraftStorageWarningShown = true;
        voiceStorageFeedback('save');
      }
      return;
    }
    const stored: AccountChatVoiceDraft = {
      key: accountChatVoiceDraftKey(targetStore.profile, conversationId),
      accountId: targetStore.profile,
      conversationId,
      blob: draft.blob,
      fileName: draft.fileName,
      durationMs: draft.durationMs,
      replyToId: draft.replyToId,
      updatedAt: Date.now()
    };
    try {
      await voiceDraftPersistence.putVoiceDraft(stored);
      if (store === targetStore && voiceDraft?.url === draft.url) {
        voiceDraft = {
          ...voiceDraft,
          accountId: targetStore.profile,
          conversationId
        };
      }
    } catch (error) {
      console.warn('[mensagens] voice draft save failed', error);
      if (!voiceDraftStorageWarningShown) {
        voiceDraftStorageWarningShown = true;
        voiceStorageFeedback('save');
      }
    }
  }

  function updateVoiceDraftReply(replyToId?: string): void {
    const targetStore = richStore;
    if (!voiceDraft || !targetStore) return;
    voiceDraft = { ...voiceDraft, replyToId };
    void persistVoiceDraft(voiceDraft, targetStore);
  }

  async function restoreVoiceDraft(
    targetStore: AccountChatStore,
    conversationId: string,
    sequence: number
  ): Promise<void> {
    try {
      const stored = await voiceDraftPersistence.getVoiceDraft(targetStore.profile, conversationId);
      if (
        sequence !== voiceDraftRestoreSequence ||
        store !== targetStore ||
        targetStore.conversationId !== conversationId ||
        !stored
      ) return;
      clearVoiceDraft();
      voiceDraft = {
        blob: stored.blob,
        url: URL.createObjectURL(stored.blob),
        fileName: stored.fileName,
        durationMs: stored.durationMs,
        replyToId: stored.replyToId,
        accountId: stored.accountId,
        conversationId: stored.conversationId
      };
      recordingElapsedMs = stored.durationMs;
      voiceAnnouncement = $t('mensagens.voice.restored', {
        default: 'Recuperei a gravação que tinhas deixado nesta conversa.'
      });
      if (stored.replyToId) {
        let reply = targetStore.messages.find((message) => message.id === stored.replyToId);
        if (!reply && await targetStore.loadMessageContext(stored.replyToId)) {
          reply = targetStore.messages.find((message) => message.id === stored.replyToId);
        }
        if (
          reply &&
          sequence === voiceDraftRestoreSequence &&
          store === targetStore &&
          voiceDraft?.replyToId === stored.replyToId
        ) replyingTo = reply;
      }
    } catch (error) {
      console.warn('[mensagens] voice draft restore failed', error);
      if (!voiceDraftStorageWarningShown) {
        voiceDraftStorageWarningShown = true;
        voiceStorageFeedback('restore');
      }
    }
  }

  /** Tear down an in-flight permission request/recorder without creating a draft. */
  function abandonVoiceRecording(): void {
    recordingGeneration += 1;
    recordingStopMode = 'discard';
    clearRecordingTimer();

    const recorder = mediaRecorder;
    mediaRecorder = null;
    recorder?.stream.getTracks().forEach((track) => track.stop());
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* The tracks are already stopped; there is nothing left to retain. */
        }
      }
    }

    stopRecordingTracks(recordingStream);
    recordingStream = null;
    recordingChunks = [];
    recordingStartedAt = 0;
    recordingElapsedMs = 0;
    recording = false;
    voicePreparing = false;
    voiceFinalizing = false;
  }

  function resetVoiceComposer(announce = true): void {
    const hadVoice = voicePreparing || recording || voiceFinalizing || Boolean(voiceDraft);
    const discardedDraft = voiceDraft;
    voiceDraftRestoreSequence += 1;
    abandonVoiceRecording();
    clearVoiceDraft();
    voiceSending = false;
    if (announce && hadVoice) {
      voiceAnnouncement = $t('mensagens.voice.deleted', { default: 'Gravação eliminada.' });
      void deletePersistedVoiceDraft(discardedDraft);
    } else if (!announce) {
      voiceDraftRestoredScope = '';
      voiceAnnouncement = '';
    }
  }

  async function startVoiceRecording(): Promise<void> {
    if (voicePreparing || recording || voiceFinalizing || voiceSending || !store || editingMessage) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      showToast($t('agente.chat.no_audio_support', { default: 'O teu browser não suporta gravação de áudio.' }));
      return;
    }

    const previousVoiceDraft = voiceDraft;
    const generation = ++recordingGeneration;
    const targetStore = store;
    voicePreparing = true;
    voiceAnnouncement = $t('mensagens.voice.requesting_mic', { default: 'A pedir acesso ao microfone.' });

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      if (generation !== recordingGeneration || targetStore !== store) {
        stopRecordingTracks(stream);
        return;
      }

      const supportsMime = typeof MediaRecorder.isTypeSupported === 'function'
        ? (mimeType: string) => MediaRecorder.isTypeSupported(mimeType)
        : undefined;
      const preferredMime = preferredVoiceMime(supportsMime);
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordingChunks = [];
      recordingStream = stream;
      mediaRecorder = recorder;
      recordingStopMode = 'preview';
      recorder.ondataavailable = (event) => {
        if (generation === recordingGeneration && event.data.size > 0) recordingChunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation !== recordingGeneration) return;
        abandonVoiceRecording();
        showToast($t('mensagens.voice.recording_failed', { default: 'A gravação parou. Tenta novamente.' }));
      };
      recorder.onstop = () => {
        const chunks = recordingChunks;
        const shouldPreview = generation === recordingGeneration && recordingStopMode === 'preview';
        const wallClockDuration = recordingStartedAt > 0 ? Date.now() - recordingStartedAt : 0;
        const durationMs = Math.max(recordingElapsedMs, wallClockDuration);
        recordingChunks = [];
        clearRecordingTimer();
        stopRecordingTracks(stream);
        if (generation !== recordingGeneration) return;

        mediaRecorder = null;
        recordingStream = null;
        recordingStartedAt = 0;
        recording = false;
        voicePreparing = false;
        voiceFinalizing = false;
        if (!shouldPreview) {
          recordingElapsedMs = 0;
          return;
        }

        const chunkMime = chunks.find((chunk) => chunk instanceof Blob && Boolean(chunk.type));
        const mimeType = normalizeVoiceMime(recorder.mimeType || (chunkMime instanceof Blob ? chunkMime.type : ''));
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size === 0) {
          recordingElapsedMs = 0;
          showToast($t('mensagens.voice.empty', { default: 'A gravação ficou vazia. Tenta novamente.' }));
          return;
        }

        clearVoiceDraft();
        const nextDraft: NonNullable<typeof voiceDraft> = {
          blob,
          url: URL.createObjectURL(blob),
          fileName: voiceFileName(mimeType),
          durationMs,
          replyToId: replyingTo?.id,
          accountId: targetStore instanceof AccountChatStore ? targetStore.profile : undefined,
          conversationId: targetStore instanceof AccountChatStore ? targetStore.conversationId ?? undefined : undefined
        };
        voiceDraft = nextDraft;
        if (targetStore instanceof AccountChatStore) void persistVoiceDraft(nextDraft, targetStore);
        recordingElapsedMs = durationMs;
        voiceAnnouncement = $t('mensagens.voice.preview_ready', {
          default: 'Gravação pronta. Podes ouvi-la antes de enviar.'
        });
      };

      recorder.start(250);
      // A failed permission/start attempt leaves the previous take intact.
      clearVoiceDraft();
      if (previousVoiceDraft) void deletePersistedVoiceDraft(previousVoiceDraft);
      recordingStartedAt = Date.now();
      recordingElapsedMs = 0;
      voicePreparing = false;
      recording = true;
      voiceAnnouncement = $t('mensagens.voice.recording_started', { default: 'Gravação iniciada.' });
      recordingTimer = setInterval(() => {
        if (generation === recordingGeneration && recordingStartedAt > 0) {
          recordingElapsedMs = Date.now() - recordingStartedAt;
        }
      }, 250);
    } catch (error) {
      stopRecordingTracks(stream);
      if (generation !== recordingGeneration) return;
      abandonVoiceRecording();
      console.error('[mensagens] getUserMedia failed', error);
      showToast($t('agente.chat.mic_denied', { default: 'Não consegui aceder ao microfone. Verifica as permissões.' }));
    }
  }

  function stopVoiceRecording(): void {
    const recorder = mediaRecorder;
    if (!recorder || recorder.state === 'inactive' || voiceFinalizing) return;
    recordingElapsedMs = Math.max(recordingElapsedMs, Date.now() - recordingStartedAt);
    clearRecordingTimer();
    recordingStopMode = 'preview';
    recording = false;
    voiceFinalizing = true;
    voiceAnnouncement = $t('mensagens.voice.preparing_preview', { default: 'A preparar a gravação.' });
    try {
      recorder.stop();
    } catch {
      abandonVoiceRecording();
      showToast($t('mensagens.voice.recording_failed', { default: 'A gravação parou. Tenta novamente.' }));
    }
  }

  function cancelVoiceRecording(): void {
    resetVoiceComposer(true);
  }

  async function recordVoiceAgain(): Promise<void> {
    recordingElapsedMs = 0;
    await startVoiceRecording();
  }

  async function sendVoiceDraft(): Promise<void> {
    const draft = voiceDraft;
    const targetStore = store;
    if (!draft || !targetStore || voiceSending) return;

    voiceSending = true;
    voiceAnnouncement = $t('mensagens.voice.sending', { default: 'A enviar a mensagem de voz.' });
    try {
      const result = targetStore instanceof AccountChatStore
        ? await targetStore.sendMediaMessage(draft.blob, draft.fileName, draft.replyToId ?? replyingTo?.id)
        : await targetStore.sendMediaMessage(draft.blob, draft.fileName);
      if (shouldClearVoiceDraft(result)) await deletePersistedVoiceDraft(draft);
      if (store !== targetStore) return;
      afterSendFeedback(result);
      if (shouldClearVoiceDraft(result) && voiceDraft?.url === draft.url) clearVoiceDraft();
      if (store === targetStore) {
        if (shouldClearVoiceDraft(result)) replyingTo = null;
        voiceAnnouncement = result === 'failed'
          ? $t('mensagens.voice.send_failed', { default: 'Não foi possível enviar a gravação.' })
          : $t('mensagens.voice.sent', { default: 'Mensagem de voz enviada.' });
        void scrollToBottom();
      }
    } catch (error) {
      if (store !== targetStore) return;
      mediaErrorToast(error);
      voiceAnnouncement = $t('mensagens.voice.send_failed', {
        default: 'Não foi possível enviar. A gravação continua disponível.'
      });
    } finally {
      if (store === targetStore) voiceSending = false;
    }
  }

  async function announceMessageAction(feedback: string): Promise<void> {
    messageActionAnnouncement = '';
    await tick();
    messageActionAnnouncement = feedback;
  }

  async function retry(localId: string) {
    if (!store) return;
    const targetStore = store;
    const retried = targetStore.messages.find((message) => message.id === localId);
    try {
      const result = await targetStore.retryMessage(localId);
      if (store !== targetStore) return;
      if (result === 'sent' && retried?.text) {
        const key = currentDraftKey();
        const storedDraft = draftFor(key);
        if (storedDraft.trim() === retried.text.trim()) clearConfirmedDraft(key, storedDraft);
      }
      afterSendFeedback(result);
      if (
        result === 'sent' &&
        retried &&
        (Boolean(retried.localBlob || retried.mediaType) || ['image', 'audio', 'video', 'file'].includes(retried.kind ?? ''))
      ) {
        const feedback = $t('mensagens.media_retry_sent', { default: 'Anexo enviado com sucesso.' });
        await announceMessageAction(feedback);
        showToast(feedback);
      } else if (result === 'failed') {
        await announceMessageAction($t('mensagens.retry_failed', {
          default: 'A nova tentativa falhou. O anexo continua disponível se ainda estiver neste dispositivo.'
        }));
      }
    } catch (error) {
      if (store !== targetStore) return;
      mediaErrorToast(error);
      await announceMessageAction($t('mensagens.retry_failed', {
        default: 'A nova tentativa falhou. Tenta novamente quando houver ligação.'
      }));
    }
  }

  async function discardFailed(localId: string): Promise<void> {
    const targetStore = richStore;
    if (!targetStore) return;
    const confirmed = typeof window === 'undefined' || window.confirm($t('mensagens.discard_failed.confirm', {
      default: 'Remover esta mensagem que não foi enviada?'
    }));
    if (!confirmed) return;
    const result = await targetStore.discardFailedMessage(localId);
    if (store !== targetStore) return;
    const feedback = result === 'discarded'
      ? $t('mensagens.discard_failed.done', { default: 'Mensagem não enviada removida.' })
      : result === 'reconciled'
        ? $t('mensagens.discard_failed.reconciled', {
            default: 'A mensagem afinal já tinha sido enviada e foi recuperada.'
          })
        : $t('mensagens.discard_failed.blocked', {
            default: 'Ainda não é seguro remover: não consegui confirmar o estado no servidor.'
          });
    await announceMessageAction(feedback);
    showToast(feedback);
  }

  function beginReply(message: LocalChatMessage): void {
    if (!richStore || message.deleted) return;
    replyingTo = message;
    updateVoiceDraftReply(message.id);
    editingMessage = null;
    messageMenuId = null;
    void tick().then(() => inputEl?.focus());
  }

  function beginEdit(message: LocalChatMessage): void {
    if (!richStore || !canEditChatMessage(message, richStore.profile)) return;
    if (voicePreparing || recording || voiceFinalizing || voiceDraft) {
      showToast($t('mensagens.message.finish_voice_first', {
        default: 'Termina ou elimina a gravação antes de editar uma mensagem.'
      }));
      return;
    }
    persistCurrentDraft();
    editingMessage = message;
    replyingTo = null;
    input = message.text ?? '';
    messageMenuId = null;
    void tick().then(() => {
      autogrow();
      inputEl?.focus();
      inputEl?.setSelectionRange(input.length, input.length);
    });
  }

  function cancelComposeMode(): void {
    replyingTo = null;
    updateVoiceDraftReply(undefined);
    const wasEditing = Boolean(editingMessage);
    editingMessage = null;
    if (wasEditing) restoreCurrentDraft();
    else if (inputEl) inputEl.style.height = 'auto';
  }

  async function deleteRichMessage(message: LocalChatMessage): Promise<void> {
    const targetStore = richStore;
    if (!targetStore || message.from !== targetStore.profile) return;
    messageMenuId = null;
    try {
      await targetStore.deleteMessage(message.id);
      if (richStore !== targetStore) return;
      showToast($t('mensagens.message.deleted_toast', { default: 'Mensagem apagada.' }));
    } catch {
      if (richStore !== targetStore) return;
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function reactTo(message: LocalChatMessage, emoji: string): Promise<void> {
    const targetStore = richStore;
    if (!targetStore || message.deleted) return;
    messageMenuId = null;
    try {
      await targetStore.toggleReaction(message.id, emoji);
    } catch {
      if (richStore !== targetStore) return;
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function toggleStar(message: LocalChatMessage): Promise<void> {
    const targetStore = richStore;
    if (!targetStore || message.deleted) return;
    messageMenuId = null;
    try {
      await targetStore.toggleStar(message.id);
    } catch {
      if (richStore !== targetStore) return;
      showToast($t('mensagens.message.action_failed', { default: 'Não consegui fazer isso. Tenta novamente.' }));
    }
  }

  async function copyMessage(message: LocalChatMessage): Promise<void> {
    const targetStore = store;
    messageMenuId = null;
    const copied = Boolean(message.text) && await copyTextToClipboard(message.text ?? '');
    if (store !== targetStore) return;
    const feedback = copied
      ? $t('mensagens.message.copied', { default: 'Mensagem copiada.' })
      : $t('mensagens.message.copy_failed', { default: 'Não foi possível copiar esta mensagem.' });
    // Clear first so screen readers announce the same action twice in a row.
    await announceMessageAction(feedback);
    showToast(feedback);
  }

  function openMessageInfo(message: LocalChatMessage): void {
    if (!richStore || message.from !== richStore.profile) return;
    messageMenuId = null;
    messageInfoReturnFocus = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
    messageInfo = message;
    void tick().then(() => messageInfoCloseEl?.focus());
  }

  function closeMessageInfo(): void {
    messageInfo = null;
    const returnFocus = messageInfoReturnFocus;
    messageInfoReturnFocus = null;
    void tick().then(() => returnFocus?.focus());
  }

  function onMessageInfoKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMessageInfo();
      return;
    }
    if (event.key !== 'Tab' || !messageInfoDialogEl) return;
    const focusable = [...messageInfoDialogEl.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleMessageMenu(id: string): void {
    const opening = messageMenuId !== id;
    messageMenuId = opening ? id : null;
    if (opening) {
      void tick().then(() => {
        document.querySelector<HTMLElement>(`#message-actions-${CSS.escape(id)} [role="menuitem"]`)?.focus();
      });
    }
  }

  function onMessageMenuKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      messageMenuId = null;
      void tick().then(() => document.getElementById(`message-menu-trigger-${id}`)?.focus());
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .filter((element) => !element.hasAttribute('disabled'));
    if (!items.length) return;
    event.preventDefault();
    const active = items.indexOf(document.activeElement as HTMLElement);
    const index = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowUp'
          ? (active <= 0 ? items.length - 1 : active - 1)
          : (active + 1) % items.length;
    items[index]?.focus();
  }

  async function jumpToMessage(
    id: string,
    targetStore: AccountChatStore | null = richStore,
    fromDeepLink = false
  ): Promise<void> {
    let element = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    if (!element && searchQuery) {
      searchOpen = false;
      searchQuery = '';
      targetStore?.clearSearch();
      await tick();
      element = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
    }
    if (!element && targetStore) {
      const loaded = await targetStore.loadMessageContext(id);
      if (store !== targetStore) return;
      if (loaded) {
        await tick();
        element = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
      }
    }
    if (!element) {
      const feedback = $t('mensagens.message.context_unavailable', {
        default: 'Não consegui abrir essa mensagem. Pode ter sido apagada ou a ligação pode estar indisponível.'
      });
      await announceMessageAction(feedback);
      showToast(feedback);
      return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add('message-highlight');
    if (fromDeepLink) {
      element.setAttribute('tabindex', '-1');
      element.focus({ preventScroll: true });
    }
    setTimeout(() => {
      element?.classList.remove('message-highlight');
      if (fromDeepLink) element?.removeAttribute('tabindex');
    }, 1600);
  }

  function onViewerKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && viewerSrc) viewerSrc = null;
  }
</script>

<svelte:window onkeydown={onViewerKeydown} />

<svelte:head>
  <title>{$t('mensagens.title', { default: 'Mensagens' })} — Presuntinho</title>
</svelte:head>

{#snippet conversationIndicators(item: AccountChatInboxItem)}
  {#if item.pinnedAt > 0}
    <span
      class="preference-indicator"
      title={$t('mensagens.preferences.pinned', { default: 'Conversa fixada' })}
      aria-label={$t('mensagens.preferences.pinned', { default: 'Conversa fixada' })}
    >📌</span>
  {/if}
  {#if isConversationMuted(item.mutedUntil)}
    <span
      class="preference-indicator"
      title={$t('mensagens.preferences.muted', { default: 'Conversa silenciada' })}
      aria-label={$t('mensagens.preferences.muted', { default: 'Conversa silenciada' })}
    >🔕</span>
  {/if}
{/snippet}

{#snippet conversationMenu(item: AccountChatInboxItem, name: string)}
  <details class="conversation-menu" aria-busy={conversationActionBusy === item.conversationId}>
    <summary
      aria-label={$t('mensagens.preferences.actions_for', {
        default: 'Opções para {name}',
        values: { name }
      })}
      title={$t('mensagens.preferences.actions', { default: 'Opções da conversa' })}
    >{conversationActionBusy === item.conversationId ? '…' : '⋮'}</summary>
    <div class="conversation-menu-panel" role="menu" aria-label={$t('mensagens.preferences.actions', { default: 'Opções da conversa' })}>
      <button
        type="button"
        role="menuitem"
        disabled={conversationActionBusy === item.conversationId}
        onclick={(event) => toggleConversationPinned(item, event)}
      >{item.pinnedAt > 0 ? '📌 ' + $t('mensagens.preferences.unpin', { default: 'Desafixar' }) : '📌 ' + $t('mensagens.preferences.pin', { default: 'Fixar' })}</button>
      <button
        type="button"
        role="menuitem"
        disabled={conversationActionBusy === item.conversationId}
        onclick={(event) => setConversationMute(item, 'eight_hours', event)}
      >🔕 {$t('mensagens.preferences.mute_8h', { default: 'Silenciar durante 8 horas' })}</button>
      <button
        type="button"
        role="menuitem"
        disabled={conversationActionBusy === item.conversationId}
        onclick={(event) => setConversationMute(item, 'forever', event)}
      >🔕 {$t('mensagens.preferences.mute_forever', { default: 'Silenciar sempre' })}</button>
      {#if isConversationMuted(item.mutedUntil)}
        <button
          type="button"
          role="menuitem"
          disabled={conversationActionBusy === item.conversationId}
          onclick={(event) => setConversationMute(item, 'off', event)}
        >🔔 {$t('mensagens.preferences.unmute', { default: 'Voltar a ouvir' })}</button>
      {/if}
      <button
        type="button"
        role="menuitem"
        disabled={conversationActionBusy === item.conversationId}
        onclick={(event) => toggleConversationArchived(item, event)}
      >{item.archivedAt > 0 ? '🗃️ ' + $t('mensagens.preferences.unarchive', { default: 'Desarquivar' }) : '🗃️ ' + $t('mensagens.preferences.archive', { default: 'Arquivar' })}</button>
    </div>
  </details>
{/snippet}

<div class="chat-root">
  <p class="message-action-live" role="status" aria-live="polite" aria-atomic="true">{messageActionAnnouncement}</p>
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
            {richStore
              ? $t('mensagens.status.offline_retry', { default: 'Sem ligação — os envios falhados ficam com a opção Tentar novamente.' })
              : $t('mensagens.status.offline', { default: 'Offline — guardado no dispositivo.' })}
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
            {richStore
              ? $t('mensagens.status.offline_retry', { default: 'Sem ligação — os envios falhados ficam com a opção Tentar novamente.' })
              : $t('mensagens.status.offline', { default: 'Offline — guardado no dispositivo.' })}
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
          disabledReason={callSurfaceDisabledReason}
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
        maxlength="160"
        placeholder={$t('mensagens.search.placeholder', { default: 'Pesquisar mensagens…' })}
        aria-label={$t('mensagens.search.placeholder', { default: 'Pesquisar mensagens…' })}
      />
      {#if searchQuery}
        <button type="button" onclick={() => (searchQuery = '')} aria-label={$t('mensagens.search.clear', { default: 'Limpar pesquisa' })}>×</button>
      {/if}
    </div>
    {#if searchQuery.trim()}
      <div class:search-error={!richStore || richStore.searchError} class="chat-search-status" role="status" aria-live="polite">
        {#if !richStore}
          <span>{$t('mensagens.search.loaded_only', {
            default: 'Resultados apenas das mensagens carregadas neste dispositivo.'
          })}</span>
        {:else if richStore.searchError}
          <span>{$t('mensagens.search.local_fallback', {
            default: 'Não foi possível pesquisar no servidor. Resultados apenas das mensagens carregadas.'
          })}</span>
          <button type="button" onclick={() => void richStore?.searchMessages(searchQuery)}>
            {$t('mensagens.search.retry', { default: 'Tentar novamente' })}
          </button>
        {:else if richStore.searchLoading || richStore.searchActiveQuery !== searchQuery.trim()}
          <span>{$t('mensagens.search.searching_all', { default: 'A pesquisar em toda a conversa…' })}</span>
        {:else}
          <span>{$t('mensagens.search.all_history', { default: 'Resultados de toda a conversa' })}</span>
        {/if}
      </div>
    {/if}
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
        {#if legacy && canCouple}
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
              <small class:has-draft={Boolean(draftFor(coupleDraftKey('main')))}>{conversationPreview('main')}</small>
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
                <small class:has-draft={Boolean(draftFor(coupleDraftKey(c.id)))}>{conversationPreview(c.id)}</small>
              </span>
            </button>
          {/each}
        {:else if !legacy && accountState.account}
          {#if archivedConversationCount > 0 || showArchived}
            <button
              type="button"
              class="archived-toggle"
              aria-expanded={showArchived}
              onclick={() => (showArchived = !showArchived)}
            >
              <span aria-hidden="true">{showArchived ? '←' : '🗃️'}</span>
              <span>{showArchived
                ? $t('mensagens.preferences.back_to_chats', { default: 'Voltar às conversas' })
                : $t('mensagens.preferences.archived', { default: 'Arquivadas' })}</span>
              {#if !showArchived}<span class="archive-count">{archivedConversationCount}</span>{/if}
            </button>
          {/if}

          {#if showArchived}
            <h2 class="list-section">{$t('mensagens.preferences.archived', { default: 'Arquivadas' })}</h2>
          {/if}

          {#each accountConversationRows as row (row.key)}
            <div class:couple={row.kind === 'couple' && row.preset.id === 'main'} class="chat-row-wrap">
              {#if row.kind === 'couple'}
                {@const itemName = row.preset.id === 'main' ? partnerName : $t(row.preset.titleKey)}
                <button type="button" class="chat-row" onclick={() => selectConversation(row.preset.id)}>
                  <span class:couple-av={row.preset.id === 'main'} class="row-av" aria-hidden="true">{row.preset.id === 'main' ? partnerEmoji : row.preset.icon}</span>
                  <span class="row-body">
                    <span class="row-top">
                      <strong>{itemName}{#if row.preset.id === 'main'} <span class="couple-heart" aria-hidden="true">💞</span>{/if}</strong>
                      <span class="row-meta">
                        {#if row.inbox}{@render conversationIndicators(row.inbox)}{/if}
                        {#if row.inbox?.lastMessageAt}<time>{fmtTime(row.inbox.lastMessageAt)}</time>{/if}
                        {#if row.inbox?.unreadCount}
                          <span class="unread-badge" aria-label={$t('mensagens.unread_count', { default: '{n} mensagens por ler', values: { n: row.inbox.unreadCount } })}>{row.inbox.unreadCount}</span>
                        {/if}
                      </span>
                    </span>
                    <small class:has-draft={Boolean(draftFor(accountRowDraftKey(row)))}>{accountRowPreview(row)}</small>
                  </span>
                </button>
                {#if row.inbox}{@render conversationMenu(row.inbox, itemName)}{/if}
              {:else}
                {@const itemName = row.contact.display_name || `@${row.contact.handle}`}
                <button type="button" class="chat-row" onclick={() => openDm(row.contact)}>
                  <Avatar emoji={row.contact.emoji} url={row.contact.avatar_url} size={52} alt="" />
                  <span class="row-body">
                    <span class="row-top">
                      <strong>{itemName}</strong>
                      <span class="row-meta">
                        {#if row.inbox}{@render conversationIndicators(row.inbox)}{/if}
                        {#if row.inbox?.lastMessageAt}<time>{fmtTime(row.inbox.lastMessageAt)}</time>{/if}
                        {#if row.inbox?.unreadCount}
                          <span class="unread-badge" aria-label={$t('mensagens.unread_count', { default: '{n} mensagens por ler', values: { n: row.inbox.unreadCount } })}>{row.inbox.unreadCount}</span>
                        {/if}
                      </span>
                    </span>
                    <small class:has-draft={Boolean(draftFor(accountRowDraftKey(row)))}>{accountRowPreview(row)}</small>
                  </span>
                </button>
                {#if row.inbox}{@render conversationMenu(row.inbox, itemName)}{/if}
              {/if}
            </div>
          {/each}

          {#if accountConversationRows.length === 0}
            <p class="list-hint">
              {showArchived
                ? $t('mensagens.preferences.no_archived', { default: 'Não tens conversas arquivadas.' })
                : $t('mensagens.no_friends_hint', { default: 'Quando adicionares amigos, as conversas aparecem aqui.' })}
            </p>
          {/if}
          {#if !showArchived}
            <a class="find-row" href="/contactos/">🔍 {$t('mensagens.find_people', { default: 'Procurar pessoas' })}</a>
          {/if}
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
      <button type="button" class:active={panelMode === 'files'} onclick={toggleFilesPanel}>
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
                <small class:has-draft={Boolean(draftFor(coupleDraftKey(c.id)))}>{conversationPreview(c.id)}</small>
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
        {#if richStore?.mediaLoading && !richStore.mediaLoaded}
          <p class="panel-empty" role="status">{$t('mensagens.files.loading', { default: 'A carregar a galeria…' })}</p>
        {:else if richStore?.mediaError && fileMessages.length === 0}
          <div class="panel-empty panel-retry" role="alert">
            <p>{$t('mensagens.files.load_failed', { default: 'Não consegui carregar a galeria.' })}</p>
            <button type="button" onclick={() => void richStore?.loadMediaGallery()}>
              {$t('mensagens.search.retry', { default: 'Tentar novamente' })}
            </button>
          </div>
        {:else if fileMessages.length === 0}
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
          {#if richStore?.mediaError}
            <div class="panel-empty panel-retry" role="alert">
              <p>{$t('mensagens.files.more_failed', { default: 'Não consegui carregar mais ficheiros.' })}</p>
              <button type="button" onclick={() => void richStore?.loadMediaGallery(true)}>
                {$t('mensagens.search.retry', { default: 'Tentar novamente' })}
              </button>
            </div>
          {:else if richStore?.mediaHasMore}
            <button
              type="button"
              class="load-more-media"
              disabled={richStore.mediaLoading}
              onclick={() => void richStore?.loadMediaGallery(true)}
            >
              {richStore.mediaLoading
                ? $t('mensagens.files.loading_more', { default: 'A carregar…' })
                : $t('mensagens.files.load_more', { default: 'Carregar mais ficheiros' })}
            </button>
          {/if}
        {/if}
      </aside>
    {/if}
  {/if}

  {#if store?.offline && !syncBlocked && view === 'thread'}
    <div class="offline-banner" role="status">
      {richStore
        ? $t('mensagens.offline_retry', {
            default: 'Sem ligação — as mensagens ficam guardadas neste dispositivo e seguem automaticamente quando a ligação voltar.'
          })
        : $t('mensagens.offline', {
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
      {#if store.ready && store.messages.length === 0 && !searchQuery.trim()}
        <div class="empty">
          <span class="empty-heart" aria-hidden="true">💌</span>
          <p class="empty-title">{$t('mensagens.empty', { default: 'Ainda não há mensagens aqui.' })}</p>
          <p class="empty-hint">
            {threadKind === 'dm'
              ? $t('mensagens.empty_hint_dm', { default: 'Diz olá! 👋' })
              : $t('mensagens.empty_hint', { default: 'Deixa uma nota, envia uma foto ou grava um áudio quando quiseres.' })}
          </p>
        </div>
      {:else if searchQuery && groups.length === 0 && !(richStore && !richStore.searchError && (richStore.searchLoading || richStore.searchActiveQuery !== searchQuery.trim()))}
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
          {@const messageState = own ? deliveryState(m) : 'sent'}
          {@const historyCallDirection = m.kind === 'call' ? callDirection(m.call) : null}
          <div class="msg" class:msg-own={own} class:msg-other={!own} class:msg-system={m.kind === 'call'} data-message-id={m.id}>
            <div class="bubble" class:bubble-own={own} class:pop={own} class:bubble-call={m.kind === 'call'} class:bubble-deleted={m.deleted}>
              {#if m.starred}<span class="star-mark" title={$t('mensagens.message.starred', { default: 'Marcada' })}>★</span>{/if}
              {#if m.reply}
                <button
                  type="button"
                  class="reply-quote"
                  onclick={() => void jumpToMessage(m.reply?.id ?? '')}
                  aria-label={`${$t('mensagens.message.reply', { default: 'Resposta' })}: ${replyLabel({ text: m.reply.text, kind: m.reply.kind, deleted: m.reply.deleted })}`}
                >
                  <strong>{$t('mensagens.message.reply', { default: 'Resposta' })}</strong>
                  <span>{replyLabel({ text: m.reply.text, kind: m.reply.kind, deleted: m.reply.deleted })}</span>
                </button>
              {/if}
              {#if m.deleted}
                <div class="deleted-copy">🚫 {$t('mensagens.message.deleted', { default: 'Mensagem apagada' })}</div>
              {:else if m.kind === 'call'}
                <div class="call-event">
                  <span class="call-event-icon" aria-hidden="true">
                    {m.call?.kind === 'video' ? '🎥' : '📞'}{historyCallDirection === 'outgoing' ? '↗' : historyCallDirection === 'incoming' ? '↙' : ''}
                  </span>
                  <span class="call-event-copy">
                    <strong>{callHistoryLabel(m)}</strong>
                    {#if callDuration(m)}
                      <small>{$t('mensagens.call.duration', { default: 'Duração {time}', values: { time: callDuration(m) ?? '' } })}</small>
                    {/if}
                  </span>
                  <span class="call-again">
                    <CallStartAction
                      conversationId={richStore?.conversationId ?? null}
                      kind={m.call?.kind === 'video' ? 'video' : 'audio'}
                      variant="history"
                      disabledReason={callSurfaceDisabledReason}
                      descriptionId={m.id}
                    />
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
                  {#if messageState === 'pending'}
                    <span class="ticks" aria-label={$t('mensagens.aria.pendente', { default: 'A enviar…' })}>🕓</span>
                  {:else if messageState === 'queued'}
                    <span class="ticks" aria-label={$t('mensagens.aria.na_fila', { default: 'Na fila para enviar' })}>🕓</span>
                  {:else if messageState === 'failed'}
                    <span class="failed-actions">
                      <button type="button" class="retry" onclick={() => void retry(m.id)}>
                        ⚠️ {$t('mensagens.retry', { default: 'Tentar de novo' })}
                      </button>
                      {#if richStore}
                        <button type="button" class="discard-failed" onclick={() => void discardFailed(m.id)}>
                          {$t('mensagens.discard_failed.action', { default: 'Remover' })}
                        </button>
                      {/if}
                    </span>
                  {:else if messageState === 'read'}
                    <span class="ticks read" aria-label={$t('mensagens.aria.lida', { default: 'Lida' })}>✓✓</span>
                  {:else if messageState === 'delivered'}
                    <span class="ticks" aria-label={$t('mensagens.aria.entregue', { default: 'Entregue no outro dispositivo' })}>✓✓</span>
                  {:else}
                    <span class="ticks" aria-label={$t('mensagens.aria.enviada', { default: 'Enviada para o servidor' })}>✓</span>
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
                  id={`message-menu-trigger-${m.id}`}
                  onclick={() => toggleMessageMenu(m.id)}
                  aria-haspopup="menu"
                  aria-expanded={messageMenuId === m.id}
                  aria-controls={`message-actions-${m.id}`}
                  aria-label={$t('mensagens.message.actions', { default: 'Ações da mensagem' })}
                >⋯</button>
                {#if messageMenuId === m.id}
                  <div
                    class="message-menu"
                    role="menu"
                    tabindex="-1"
                    id={`message-actions-${m.id}`}
                    aria-label={$t('mensagens.message.actions', { default: 'Ações da mensagem' })}
                    onkeydown={(event) => onMessageMenuKeydown(event, m.id)}
                  >
                    {#if !m.deleted}
                      <div class="reaction-picker" role="group" aria-label={$t('mensagens.message.react', { default: 'Reagir' })}>
                        {#each REACTIONS as emoji}
                          <button type="button" role="menuitem" onclick={() => void reactTo(m, emoji)} aria-label={emoji}>{emoji}</button>
                        {/each}
                      </div>
                      <button type="button" role="menuitem" onclick={() => beginReply(m)}>↩ {$t('mensagens.message.reply', { default: 'Responder' })}</button>
                      {#if m.text}<button type="button" role="menuitem" onclick={() => void copyMessage(m)}>⧉ {$t('mensagens.message.copy', { default: 'Copiar' })}</button>{/if}
                      <button type="button" role="menuitem" onclick={() => void toggleStar(m)}>{m.starred ? '☆' : '★'} {m.starred ? $t('mensagens.message.unstar', { default: 'Desmarcar' }) : $t('mensagens.message.star', { default: 'Marcar' })}</button>
                    {/if}
                    {#if own}<button type="button" role="menuitem" onclick={() => openMessageInfo(m)}>ⓘ {$t('mensagens.info.action', { default: 'Informação' })}</button>{/if}
                    {#if canEditChatMessage(m, richStore.profile)}<button type="button" role="menuitem" onclick={() => beginEdit(m)}>✎ {$t('mensagens.message.edit', { default: 'Editar' })}</button>{/if}
                    {#if own && !m.deleted}<button type="button" role="menuitem" class="danger" onclick={() => void deleteRichMessage(m)}>⌫ {$t('mensagens.message.delete', { default: 'Apagar' })}</button>{/if}
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      {/each}
      {#if searchQuery.trim() && richStore?.searchHasMore && !richStore.searchError}
        <button
          type="button"
          class="load-older"
          disabled={richStore.searchLoading}
          onclick={() => void richStore?.searchMessages(searchQuery, true)}
        >
          {richStore.searchLoading
            ? $t('mensagens.history.loading', { default: 'A carregar…' })
            : $t('mensagens.search.more', { default: 'Mais resultados' })}
        </button>
      {/if}
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
      <p class="voice-live" aria-live="polite" aria-atomic="true">{voiceAnnouncement}</p>
      {#if voicePreparing || recording || voiceFinalizing || voiceDraft}
        <div
          class="voice-composer"
          class:has-preview={Boolean(voiceDraft)}
          role="group"
          aria-label={$t('mensagens.voice.composer', { default: 'Mensagem de voz' })}
          aria-busy={voicePreparing || voiceFinalizing || voiceSending}
        >
          {#if voiceDraft}
            <button
              type="button"
              class="voice-icon-btn voice-delete"
              onclick={() => resetVoiceComposer(true)}
              disabled={voiceSending || voicePreparing}
              aria-label={$t('mensagens.voice.delete', { default: 'Apagar gravação' })}
              title={$t('mensagens.voice.delete', { default: 'Apagar gravação' })}
            >
              <span aria-hidden="true">🗑️</span>
            </button>
            <div class="voice-preview">
              <span class="voice-preview-icon" aria-hidden="true">🎙️</span>
              <audio
                controls
                preload="metadata"
                src={voiceDraft.url}
                aria-label={$t('mensagens.voice.preview', { default: 'Pré-visualização da mensagem de voz' })}
              ></audio>
              <time
                datetime={`PT${Math.max(0, Math.round(voiceDraft.durationMs / 1000))}S`}
                aria-label={$t('mensagens.voice.duration', {
                  values: { duration: formatVoiceDuration(voiceDraft.durationMs) },
                  default: `Duração ${formatVoiceDuration(voiceDraft.durationMs)}`
                })}
              >{formatVoiceDuration(voiceDraft.durationMs)}</time>
            </div>
            <button
              type="button"
              class="voice-icon-btn"
              onclick={() => void recordVoiceAgain()}
              disabled={voiceSending || voicePreparing}
              aria-label={$t('mensagens.voice.retake', { default: 'Gravar novamente' })}
              title={$t('mensagens.voice.retake', { default: 'Gravar novamente' })}
            >
              <span aria-hidden="true">↻</span>
            </button>
            <button
              type="button"
              class="voice-send-btn"
              onclick={() => void sendVoiceDraft()}
              disabled={voiceSending || voicePreparing || !store}
              aria-label={voiceSending
                ? $t('mensagens.voice.sending', { default: 'A enviar mensagem de voz' })
                : $t('mensagens.voice.send', { default: 'Enviar mensagem de voz' })}
              title={$t('mensagens.voice.send', { default: 'Enviar mensagem de voz' })}
            >
              <span aria-hidden="true">{voiceSending ? '…' : '➤'}</span>
            </button>
          {:else}
            <button
              type="button"
              class="voice-icon-btn voice-delete"
              onclick={cancelVoiceRecording}
              aria-label={$t('mensagens.voice.cancel', { default: 'Cancelar e apagar gravação' })}
              title={$t('mensagens.voice.cancel', { default: 'Cancelar e apagar gravação' })}
            >
              <span aria-hidden="true">🗑️</span>
            </button>
            <div class="voice-recording-status" role="status">
              {#if voicePreparing}
                <span class="voice-spinner" aria-hidden="true"></span>
                <strong>{$t('mensagens.voice.requesting_mic_short', { default: 'A preparar microfone…' })}</strong>
              {:else if voiceFinalizing}
                <span class="voice-spinner" aria-hidden="true"></span>
                <strong>{$t('mensagens.voice.preparing_preview_short', { default: 'A preparar áudio…' })}</strong>
              {:else}
                <span class="voice-recording-dot" aria-hidden="true"></span>
                <strong>{$t('mensagens.voice.recording_short', { default: 'A gravar' })}</strong>
              {/if}
              <time
                datetime={`PT${Math.max(0, Math.round(recordingElapsedMs / 1000))}S`}
                aria-label={$t('mensagens.voice.elapsed', {
                  values: { duration: formatVoiceDuration(recordingElapsedMs) },
                  default: `Tempo gravado ${formatVoiceDuration(recordingElapsedMs)}`
                })}
              >{formatVoiceDuration(recordingElapsedMs)}</time>
            </div>
            {#if recording}
              <button
                type="button"
                class="voice-stop-btn"
                onclick={stopVoiceRecording}
                aria-label={$t('agente.aria.parar_gravacao', { default: 'Parar gravação' })}
                title={$t('agente.aria.parar_gravacao', { default: 'Parar gravação' })}
              >
                <span aria-hidden="true"></span>
              </button>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="composer">
          <input type="file" bind:this={fileInput} onchange={onFileChosen} disabled={Boolean(editingMessage)} hidden accept={richStore ? 'image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip' : 'image/*,audio/*'} />
          <div class="input-shell">
            {#if threadKind === 'couple' || richStore}
              <button
                type="button"
                class="attach-btn"
                disabled={Boolean(editingMessage)}
                onclick={() => editingMessage ? undefined : fileInput?.click()}
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
              oninput={onComposerInput}
              onblur={() => richStore?.setTyping(false)}
              placeholder={editingMessage ? $t('mensagens.message.edit_placeholder', { default: 'Edita a mensagem…' }) : $t('mensagens.placeholder', { default: 'Escreve uma mensagem…' })}
              maxlength="4000"
              rows="1"
            ></textarea>
          </div>
          <button
            type="button"
            class="action-btn"
            disabled={Boolean(editingMessage && !input.trim())}
            onclick={() => (editingMessage ? void send() : input.trim() ? void send() : void startVoiceRecording())}
            aria-label={editingMessage
              ? $t('mensagens.message.save_edit', { default: 'Guardar edição' })
              : input.trim()
                ? $t('a11y.aria.enviar', { default: 'Enviar' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
            title={editingMessage
              ? $t('mensagens.message.save_edit', { default: 'Guardar edição' })
              : input.trim()
                ? $t('a11y.aria.enviar', { default: 'Enviar' })
              : $t('agente.aria.gravar', { default: 'Gravar áudio' })}
          >
            {#if editingMessage || input.trim()}➤{:else}🎤{/if}
          </button>
        </div>
      {/if}
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

{#if messageInfo}
  {@const infoState = deliveryState(messageInfo)}
  <div class="message-info-layer">
    <button
      type="button"
      class="message-info-backdrop"
      onclick={closeMessageInfo}
      aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
    ></button>
    <div
      class="message-info-sheet"
      bind:this={messageInfoDialogEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby="message-info-title"
      tabindex="-1"
      onkeydown={onMessageInfoKeydown}
    >
      <header>
        <span class="message-info-icon" aria-hidden="true">ⓘ</span>
        <h2 id="message-info-title">{$t('mensagens.info.title', { default: 'Informação da mensagem' })}</h2>
        <button
          type="button"
          class="message-info-close"
          bind:this={messageInfoCloseEl}
          onclick={closeMessageInfo}
          aria-label={$t('a11y.aria.fechar', { default: 'Fechar' })}
        >×</button>
      </header>
      <div class="message-info-preview">
        <span aria-hidden="true">{messageInfo.kind === 'image' ? '📷' : messageInfo.kind === 'audio' ? '🎙️' : messageInfo.kind === 'video' ? '🎬' : messageInfo.kind === 'file' ? '📎' : '💬'}</span>
        <p>{replyLabel({ text: messageInfo.text, kind: messageInfo.kind, name: messageInfo.name, deleted: messageInfo.deleted })}</p>
      </div>
      <dl class="message-info-facts">
        <div>
          <dt>{$t('mensagens.info.status', { default: 'Estado' })}</dt>
          <dd><span class:read={infoState === 'read'} aria-hidden="true">{infoState === 'read' || infoState === 'delivered' ? '✓✓' : infoState === 'sent' ? '✓' : infoState === 'failed' ? '!' : '🕓'}</span>{deliveryStatusLabel(infoState)}</dd>
        </div>
        <div>
          <dt>{$t('mensagens.info.sent_at', { default: 'Enviada' })}</dt>
          <dd><time datetime={new Date(messageInfo.ts).toISOString()}>{fmtDateTime(messageInfo.ts)}</time></dd>
        </div>
        {#if messageInfo.editedAt}
          <div>
            <dt>{$t('mensagens.info.edited_at', { default: 'Editada' })}</dt>
            <dd><time datetime={new Date(messageInfo.editedAt).toISOString()}>{fmtDateTime(messageInfo.editedAt)}</time></dd>
          </div>
        {/if}
        {#if infoState === 'read' || infoState === 'delivered'}
          <div>
            <dt>{infoState === 'read' ? $t('mensagens.info.read', { default: 'Leitura' }) : $t('mensagens.info.delivery', { default: 'Entrega' })}</dt>
            <dd>✓ {infoState === 'read' ? $t('mensagens.info.read_confirmed', { default: 'Confirmada' }) : $t('mensagens.info.delivery_confirmed', { default: 'Confirmada no outro dispositivo' })}</dd>
          </div>
        {/if}
      </dl>
      {#if infoState === 'read'}
        <p class="message-info-note">{$t('mensagens.info.read_time_unavailable', {
          default: 'A leitura está confirmada. O Presuntinho ainda não guarda a hora exata de leitura de cada mensagem.'
        })}</p>
      {:else if infoState === 'delivered'}
        <p class="message-info-note">{$t('mensagens.info.delivery_time_unavailable', {
          default: 'A entrega no outro dispositivo está confirmada. A hora exata desse evento ainda não é guardada por mensagem.'
        })}</p>
      {/if}
    </div>
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
  .chat-row-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .chat-row-wrap .chat-row {
    padding-inline-end: 4rem;
  }
  .chat-row-wrap.couple .chat-row {
    background: color-mix(in srgb, var(--accent) 6%, transparent);
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
  .preference-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    line-height: 1;
  }
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
  .row-body small.has-draft {
    color: var(--accent);
    font-weight: 750;
  }
  .chat-row.couple { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .couple-heart { font-size: 0.9em; }
  .archived-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 48px;
    padding: var(--space-2) var(--space-4);
    border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    background: color-mix(in srgb, var(--accent) 5%, transparent);
    color: var(--txt2);
    font: inherit;
    font-weight: 800;
    text-align: start;
    cursor: pointer;
  }
  .archived-toggle:hover,
  .archived-toggle:focus-visible {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 11%, transparent);
    outline: none;
  }
  .archive-count {
    min-width: 1.45rem;
    height: 1.45rem;
    margin-inline-start: auto;
    display: inline-grid;
    place-items: center;
    padding-inline: 0.3rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    font-size: var(--fs-xs);
  }
  .conversation-menu {
    position: absolute;
    z-index: 12;
    inset-inline-end: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
  }
  .conversation-menu[open] {
    z-index: 30;
  }
  .conversation-menu summary {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--txt3);
    cursor: pointer;
    font-size: 1.35rem;
    font-weight: 900;
    line-height: 1;
    list-style: none;
    user-select: none;
  }
  .conversation-menu summary::-webkit-details-marker { display: none; }
  .conversation-menu summary:hover,
  .conversation-menu summary:focus-visible,
  .conversation-menu[open] summary {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 13%, var(--bg-elev));
    outline: none;
  }
  .conversation-menu-panel {
    position: absolute;
    z-index: 31;
    inset-inline-end: 0;
    top: calc(100% + 0.35rem);
    width: min(17rem, calc(100vw - 2rem));
    display: grid;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-elev);
    box-shadow: var(--shadow-lg);
  }
  .chat-row-wrap:nth-last-of-type(-n + 3) .conversation-menu-panel {
    top: auto;
    bottom: calc(100% + 0.35rem);
  }
  .conversation-menu-panel button {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--txt);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }
  .conversation-menu-panel button:hover,
  .conversation-menu-panel button:focus-visible {
    background: color-mix(in srgb, var(--accent) 11%, transparent);
    color: var(--accent);
    outline: none;
  }
  .conversation-menu-panel button:disabled {
    cursor: wait;
    opacity: 0.55;
  }
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
  .chat-search-status {
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 0.35rem var(--space-4);
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg-elev));
    color: var(--txt2);
    font-size: var(--fs-xs);
    text-align: center;
  }
  .chat-search-status.search-error {
    background: color-mix(in srgb, var(--error) 8%, var(--bg-elev));
    color: var(--txt);
  }
  .chat-search-status button {
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 800;
    text-decoration: underline;
    cursor: pointer;
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
  .panel-retry {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    text-align: center;
  }
  .panel-retry p { margin: 0; }
  .panel-retry button,
  .load-more-media {
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-elev);
    color: var(--txt);
    padding: 0.55rem 1rem;
    cursor: pointer;
  }
  .load-more-media {
    display: block;
    margin: var(--space-3) auto 0;
  }
  .load-more-media:disabled { cursor: wait; opacity: 0.7; }
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
  .call-event { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-2); }
  .call-event-icon { font-size: 1.15rem; }
  .call-event-copy { display: grid; line-height: 1.2; }
  .call-event-copy strong { font-weight: 750; }
  .call-event-copy small { margin-top: 0.15rem; color: var(--txt3); font-size: var(--fs-xs); }
  .call-again { flex: 1 0 100%; display: flex; justify-content: center; min-width: 0; }
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
  .failed-actions {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.3rem;
  }
  .retry,
  .discard-failed {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 999px;
    font-size: var(--fs-xs);
    padding: 0.15rem 0.55rem;
    min-height: 28px;
    cursor: pointer;
  }
  .discard-failed {
    border-color: transparent;
    text-decoration: underline;
    opacity: 0.85;
  }
  .retry:focus-visible,
  .discard-failed:focus-visible {
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
  .voice-live {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .voice-composer {
    min-height: 58px;
    display: grid;
    grid-template-columns: var(--touch-target) minmax(0, 1fr) var(--touch-target);
    align-items: center;
    gap: var(--space-2);
    padding: 0.35rem 0.45rem;
    border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
    border-radius: 1.25rem;
    background: color-mix(in srgb, var(--bg-elev) 93%, var(--accent) 7%);
    box-shadow: var(--shadow-md);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .voice-composer.has-preview {
    grid-template-columns: var(--touch-target) minmax(0, 1fr) var(--touch-target) var(--touch-target);
  }
  .voice-icon-btn,
  .voice-send-btn,
  .voice-stop-btn {
    width: var(--touch-target);
    height: var(--touch-target);
    min-width: var(--touch-target);
    min-height: var(--touch-target);
    display: inline-grid;
    place-items: center;
    border: 0;
    border-radius: 999px;
    color: var(--txt);
    cursor: pointer;
    font: inherit;
    font-size: 1.1rem;
    transition: transform var(--motion-fast) ease, filter var(--motion-fast) ease, background var(--motion-fast) ease;
  }
  .voice-icon-btn {
    background: color-mix(in srgb, var(--txt) 8%, transparent);
  }
  .voice-icon-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--txt) 14%, transparent);
  }
  .voice-delete {
    color: var(--error);
  }
  .voice-send-btn {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--shadow-sm);
  }
  .voice-stop-btn {
    background: var(--error);
    color: #fff;
  }
  .voice-stop-btn > span {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: currentColor;
  }
  .voice-icon-btn:active:not(:disabled),
  .voice-send-btn:active:not(:disabled),
  .voice-stop-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  .voice-icon-btn:focus-visible,
  .voice-send-btn:focus-visible,
  .voice-stop-btn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
  .voice-icon-btn:disabled,
  .voice-send-btn:disabled,
  .voice-stop-btn:disabled {
    cursor: wait;
    opacity: 0.55;
  }
  .voice-recording-status,
  .voice-preview {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .voice-recording-status strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--txt);
    font-size: var(--fs-sm);
  }
  .voice-recording-status time,
  .voice-preview time {
    margin-inline-start: auto;
    color: var(--txt2);
    font-variant-numeric: tabular-nums;
    font-size: var(--fs-sm);
  }
  .voice-recording-dot {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--error);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--error) 52%, transparent);
    animation: voice-recording-pulse 1.25s ease-out infinite;
  }
  .voice-spinner {
    flex: 0 0 auto;
    width: 17px;
    height: 17px;
    border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
    border-top-color: var(--accent);
    border-radius: 999px;
    animation: voice-spin 0.8s linear infinite;
  }
  .voice-preview-icon {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .voice-preview audio {
    min-width: 0;
    width: 100%;
    height: 40px;
    accent-color: var(--accent);
  }
  @keyframes voice-recording-pulse {
    70% { box-shadow: 0 0 0 9px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
  @keyframes voice-spin {
    to { transform: rotate(360deg); }
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
  .attach-btn:disabled,
  .action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.48;
    filter: none;
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
  @media (max-width: 520px) {
    .voice-composer,
    .voice-composer.has-preview {
      gap: var(--space-1);
      padding-inline: 0.25rem;
    }
    .voice-preview-icon { display: none; }
    .voice-preview audio { height: 38px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .voice-recording-dot,
    .voice-spinner { animation: none; }
  }

  .message-action-live {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ── sender message information ── */
  .message-info-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: grid;
    place-items: end center;
  }
  .message-info-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    border: 0;
    background: color-mix(in srgb, var(--bg) 35%, rgb(0 0 0 / 0.68));
    cursor: default;
  }
  .message-info-sheet {
    position: relative;
    width: min(520px, 100%);
    max-height: min(78dvh, 620px);
    overflow-y: auto;
    padding: var(--space-4) var(--space-4) calc(var(--space-5) + env(safe-area-inset-bottom));
    border: 1px solid var(--border-strong);
    border-bottom: 0;
    border-radius: 1.4rem 1.4rem 0 0;
    background: var(--bg-elev);
    color: var(--txt);
    box-shadow: var(--shadow-lg);
    animation: message-info-in var(--motion-base) ease-out;
  }
  @keyframes message-info-in {
    from { opacity: 0; transform: translateY(1rem); }
    to { opacity: 1; transform: translateY(0); }
  }
  .message-info-sheet > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
  }
  .message-info-sheet h2 {
    margin: 0;
    font-size: var(--fs-lg);
  }
  .message-info-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    font-size: 1.2rem;
  }
  .message-info-close {
    width: var(--touch-target);
    height: var(--touch-target);
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--txt2);
    font: inherit;
    font-size: 1.5rem;
    cursor: pointer;
  }
  .message-info-close:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .message-info-close:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .message-info-preview {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-4) 0;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 7%, var(--card));
  }
  .message-info-preview > span { font-size: 1.35rem; }
  .message-info-preview p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--txt2);
  }
  .message-info-facts { margin: 0; display: grid; }
  .message-info-facts > div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.7fr) minmax(0, 1.3fr);
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .message-info-facts dt { color: var(--txt3); font-size: var(--fs-sm); }
  .message-info-facts dd {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    margin: 0;
    text-align: end;
    font-size: var(--fs-sm);
    font-weight: 750;
  }
  .message-info-facts dd span { color: var(--txt3); letter-spacing: -0.1em; }
  .message-info-facts dd span.read { color: var(--accent); }
  .message-info-note {
    margin: var(--space-4) 0 0;
    color: var(--txt3);
    font-size: var(--fs-xs);
    line-height: 1.5;
  }
  @media (min-width: 680px) {
    .message-info-layer { place-items: center; padding: var(--space-4); }
    .message-info-sheet {
      border-bottom: 1px solid var(--border-strong);
      border-radius: 1.4rem;
      padding-bottom: var(--space-5);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .message-info-sheet { animation: none; }
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
