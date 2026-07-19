// Regras puras dos posts v2 — anexos, classificação, linkify e tamanhos.
import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  fmtSize,
  linkify,
  validateAttachments,
  MAX_AUDIO_BYTES,
  MAX_FILE_BYTES,
  MAX_VIDEO_BYTES
} from './posts';

describe('classifyFile', () => {
  it('mapeia mimes para os quatro tipos', () => {
    expect(classifyFile('image/png')).toBe('image');
    expect(classifyFile('video/mp4')).toBe('video');
    expect(classifyFile('audio/webm')).toBe('audio');
    expect(classifyFile('application/pdf')).toBe('file');
    expect(classifyFile('')).toBe('file');
  });
});

describe('validateAttachments', () => {
  const img = { kind: 'image' as const, size: 1000 };
  it('aceita até 4 imagens', () => {
    expect(validateAttachments([img, img, img, img])).toBeNull();
  });
  it('rejeita mais de 4 anexos', () => {
    expect(validateAttachments([img, img, img, img, img])).toBe('too-many');
  });
  it('só permite 1 vídeo e 1 áudio', () => {
    const v = { kind: 'video' as const, size: 1000 };
    const a = { kind: 'audio' as const, size: 1000 };
    expect(validateAttachments([v, v])).toBe('one-video');
    expect(validateAttachments([a, a])).toBe('one-audio');
    expect(validateAttachments([v, a, img])).toBeNull();
  });
  it('aplica os limites de tamanho por tipo', () => {
    expect(validateAttachments([{ kind: 'video', size: MAX_VIDEO_BYTES + 1 }])).toBe('video-too-big');
    expect(validateAttachments([{ kind: 'audio', size: MAX_AUDIO_BYTES + 1 }])).toBe('audio-too-big');
    expect(validateAttachments([{ kind: 'file', size: MAX_FILE_BYTES + 1 }])).toBe('file-too-big');
    expect(validateAttachments([{ kind: 'video', size: MAX_VIDEO_BYTES }])).toBeNull();
  });
});

describe('linkify', () => {
  it('separa texto e links https', () => {
    expect(linkify('vê isto https://ex.pt/a e isto')).toEqual([
      { type: 'text', value: 'vê isto ' },
      { type: 'link', value: 'https://ex.pt/a' },
      { type: 'text', value: ' e isto' }
    ]);
  });
  it('ignora http simples e texto sem links', () => {
    expect(linkify('http://inseguro.pt olá')).toEqual([{ type: 'text', value: 'http://inseguro.pt olá' }]);
    expect(linkify('')).toEqual([]);
  });
});

describe('fmtSize', () => {
  it('formata B / kB / MB', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2 kB');
    expect(fmtSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
  });
});
