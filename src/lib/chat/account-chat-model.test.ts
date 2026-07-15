import { describe, expect, it } from 'vitest';
import {
  chatPageFilter,
  chatCallDirection,
  exactReadTimestamp,
  formatFileSize,
  mediaExtension,
  mediaKind,
  mergeChatMessages,
  parseCallBody,
  reconcileMessageReferences,
  replyLabel,
  summarizeReactions,
  type ReplyReconcileMessage
} from './account-chat-model';
import { rpcUuid } from './account-chat-store.svelte';

describe('account chat helpers', () => {
  it('classifica imagens, áudio, vídeo e documentos', () => {
    expect(mediaKind('image/webp')).toBe('image');
    expect(mediaKind('audio/webm;codecs=opus')).toBe('audio');
    expect(mediaKind('video/mp4')).toBe('video');
    expect(mediaKind('application/pdf')).toBe('file');
  });

  it('gera extensões seguras para paths de Storage', () => {
    expect(mediaExtension('../foto.final.PNG', 'image/png')).toBe('png');
    expect(mediaExtension('sem-extensao', 'application/pdf')).toBe('pdf');
    expect(mediaExtension('x.bad!ext', 'application/octet-stream')).toBe('badext');
  });

  it('substitui o envio otimista pelo row canónico através do client_id', () => {
    const local = { id: 'local-1', clientId: 'client-1', ts: 20, pending: true };
    const older = { id: 'server-0', clientId: 'client-0', ts: 10 };
    const server = { id: 'server-1', clientId: 'client-1', ts: 21 };
    expect(mergeChatMessages([local, older], [server])).toEqual([older, server]);
  });

  it('deixa a row canónica dominar também uma cópia local já marcada como falhada', () => {
    const failed = { id: 'local-1', clientId: 'client-1', ts: 20, pending: false, failed: true };
    const server = { id: 'server-1', clientId: 'client-1', ts: 21 };
    expect(mergeChatMessages([failed, server], [])).toEqual([server]);
  });

  it('ordena e pagina com o timestamp Postgres completo e o id de desempate', () => {
    const laterMicrosecond = {
      id: '00000000-0000-0000-0000-000000000002',
      ts: 1_700_000_000_000,
      createdAt: '2026-07-15T10:00:00.123456+00:00'
    };
    const earlierMicrosecond = {
      id: '00000000-0000-0000-0000-000000000001',
      ts: 1_700_000_000_000,
      createdAt: '2026-07-15T10:00:00.123455+00:00'
    };
    expect(mergeChatMessages([laterMicrosecond], [earlierMicrosecond])).toEqual([
      earlierMicrosecond,
      laterMicrosecond
    ]);
    expect(chatPageFilter({ createdAt: laterMicrosecond.createdAt, id: laterMicrosecond.id })).toBe(
      `created_at.lt.${laterMicrosecond.createdAt},and(created_at.eq.${laterMicrosecond.createdAt},id.lt.${laterMicrosecond.id})`
    );
  });

  it('preserva microssegundos no cursor de leitura', () => {
    const ts = new Date('2026-07-15T10:00:00.123Z').getTime();
    expect(exactReadTimestamp([
      { ts, createdAt: '2026-07-15T10:00:00.123455+00:00' },
      { ts, createdAt: '2026-07-15T10:00:00.123456+00:00' }
    ], ts)).toBe('2026-07-15T10:00:00.123456+00:00');
  });

  it('resume reações e assinala a reação da conta atual', () => {
    expect(
      summarizeReactions(
        [
          { emoji: '❤️', account_id: 'a' },
          { emoji: '❤️', account_id: 'b' },
          { emoji: '😂', account_id: 'b' }
        ],
        'a'
      )
    ).toEqual([
      { emoji: '❤️', count: 2, reactedByMe: true },
      { emoji: '😂', count: 1, reactedByMe: false }
    ]);
  });

  it('produz previews compactas e tamanhos legíveis', () => {
    expect(replyLabel({ kind: 'video' })).toBe('🎬');
    expect(replyLabel({ kind: 'file', name: 'conta.pdf' })).toBe('📎 conta.pdf');
    expect(replyLabel({ text: ' olá ' })).toBe('olá');
    expect(formatFileSize(1536)).toBe('2 KB');
    expect(formatFileSize(1_572_864)).toBe('1.5 MB');
  });

  it('reconcilia previews de resposta após edição e remoção do original', () => {
    const reply: ReplyReconcileMessage = {
      id: 'reply',
      ts: 2,
      from: 'b',
      reply: { id: 'original', from: 'a', text: 'antigo', kind: 'text' as const }
    };
    const original: ReplyReconcileMessage = {
      id: 'original',
      ts: 1,
      from: 'a',
      text: 'novo',
      kind: 'text' as const,
      starred: true,
      reactions: [{ emoji: '❤️', count: 1, reactedByMe: true }]
    };
    const edited = reconcileMessageReferences([original, reply], original);
    expect(edited[1].reply?.text).toBe('novo');
    const deleted = reconcileMessageReferences(edited, { ...original, text: undefined, deleted: true });
    expect(deleted[0]).toMatchObject({ starred: false, reactions: [] });
    expect(deleted[1].reply).toMatchObject({ id: 'original', deleted: true });
    expect(deleted[1].reply?.text).toBeUndefined();
  });

  it('transforma histórico de chamada em metadados seguros sem mostrar JSON', () => {
    const body = JSON.stringify({
      callId: 'call-1',
      kind: 'video',
      status: 'missed',
      caller: 'a',
      callee: 'b',
      answeredAt: null,
      endedAt: '2026-07-15T05:00:00Z'
    });
    expect(parseCallBody(body)).toEqual({
      callId: 'call-1',
      kind: 'video',
      status: 'missed',
      caller: 'a',
      callee: 'b',
      endedAt: '2026-07-15T05:00:00Z'
    });
    expect(parseCallBody('{broken')).toBeNull();
    expect(replyLabel({ kind: 'call', text: body })).toBe('📞');
		expect(chatCallDirection({ caller: 'a', callee: 'b' }, 'a')).toBe('outgoing');
		expect(chatCallDirection({ caller: 'a', callee: 'b' }, 'b')).toBe('incoming');
		expect(chatCallDirection({ caller: 'a', callee: 'b' }, 'x')).toBeNull();
  });

  it('normaliza UUIDs devolvidos por RPC como scalar, row ou array', () => {
    const id = '18ef18ff-0001-485a-b0ce-08c535bc5c6e';
    expect(rpcUuid(id)).toBe(id);
    expect(rpcUuid({ conversation_id: id })).toBe(id);
    expect(rpcUuid([{ id }])).toBe(id);
    expect(rpcUuid('não-é-uuid')).toBeNull();
  });
});
