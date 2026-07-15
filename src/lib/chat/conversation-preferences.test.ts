import { describe, expect, it } from 'vitest';
import {
  EIGHT_HOURS_MS,
  FOREVER_MUTE_AT,
  overrideMutedConversations,
  parseChatPreferencesChangedDetail,
  compareConversationPreference,
  isConversationMuted,
  isConversationMutedForever,
  mutedUntilFor,
  withConversationPreference
} from './conversation-preferences';

describe('conversation preferences', () => {
  it('calcula silêncio de 8 horas, para sempre e desligado', () => {
    const now = Date.UTC(2026, 6, 15, 10);
    expect(mutedUntilFor('eight_hours', now)).toBe(now + EIGHT_HOURS_MS);
    expect(mutedUntilFor('forever', now)).toBe(FOREVER_MUTE_AT);
    expect(mutedUntilFor('off', now)).toBe(0);
    expect(isConversationMuted(now + 1, now)).toBe(true);
    expect(isConversationMuted(now, now)).toBe(false);
    expect(isConversationMutedForever(FOREVER_MUTE_AT)).toBe(true);
  });

  it('ordena fixadas antes das restantes e usa atividade como desempate', () => {
    const rows = [
      { conversationId: 'older', lastMessageAt: 10, pinnedAt: 0, mutedUntil: 0, archivedAt: 0 },
      { conversationId: 'newer', lastMessageAt: 30, pinnedAt: 0, mutedUntil: 0, archivedAt: 0 },
      { conversationId: 'pinned-old', lastMessageAt: 5, pinnedAt: 20, mutedUntil: 0, archivedAt: 0 },
      { conversationId: 'pinned-new', lastMessageAt: 1, pinnedAt: 40, mutedUntil: 0, archivedAt: 0 }
    ];
    expect([...rows].sort(compareConversationPreference).map((row) => row.conversationId)).toEqual([
      'pinned-new',
      'pinned-old',
      'newer',
      'older'
    ]);
  });

  it('aplica uma alteração otimista sem mutar o snapshot anterior', () => {
    const before = { conversationId: 'one', lastMessageAt: 1, pinnedAt: 0, mutedUntil: 0, archivedAt: 0 };
    const after = withConversationPreference(before, { pinnedAt: 42, archivedAt: 9 });
    expect(after).toMatchObject({ pinnedAt: 42, archivedAt: 9 });
    expect(before).toMatchObject({ pinnedAt: 0, archivedAt: 0 });
  });

  it('aplica imediatamente eventos locais de mute e mantém fail-open sem snapshot', () => {
    const now = Date.UTC(2026, 6, 15, 10);
    const detail = parseChatPreferencesChangedDetail({ conversationId: 'conversation-1', mutedUntil: now + 1_000 });
    expect(detail).not.toBeNull();
    expect([...(overrideMutedConversations(null, detail!, now) ?? [])]).toEqual(['conversation-1']);
    expect(
      overrideMutedConversations(new Set(['conversation-1']), { conversationId: 'conversation-1', mutedUntil: 0 }, now)
    ).toEqual(new Set());
    expect(overrideMutedConversations(null, { conversationId: 'conversation-1', mutedUntil: 0 }, now)).toBeNull();
    expect(parseChatPreferencesChangedDetail({ conversationId: '', mutedUntil: -1 })).toBeNull();
  });
});
