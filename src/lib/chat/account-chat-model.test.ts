import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  mediaExtension,
  mediaKind,
  mergeChatMessages,
  parseCallBody,
  replyLabel,
  summarizeReactions
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
  });

  it('normaliza UUIDs devolvidos por RPC como scalar, row ou array', () => {
    const id = '18ef18ff-0001-485a-b0ce-08c535bc5c6e';
    expect(rpcUuid(id)).toBe(id);
    expect(rpcUuid({ conversation_id: id })).toBe(id);
    expect(rpcUuid([{ id }])).toBe(id);
    expect(rpcUuid('não-é-uuid')).toBeNull();
  });
});
