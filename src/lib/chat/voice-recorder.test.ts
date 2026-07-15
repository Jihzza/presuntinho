import { describe, expect, it } from 'vitest';
import {
	formatVoiceDuration,
	normalizeVoiceMime,
	preferredVoiceMime,
	voiceFileName
} from './voice-recorder';

describe('voice recorder helpers', () => {
	it('formats a live duration without negative or invalid output', () => {
		expect(formatVoiceDuration(-1)).toBe('0:00');
		expect(formatVoiceDuration(Number.NaN)).toBe('0:00');
		expect(formatVoiceDuration(61_999)).toBe('1:01');
	});

	it('selects the first codec supported by the browser', () => {
		expect(preferredVoiceMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4');
		expect(preferredVoiceMime(() => false)).toBeUndefined();
		expect(preferredVoiceMime(undefined)).toBeUndefined();
	});

	it('strips codec parameters and gives iOS recordings an m4a filename', () => {
		expect(normalizeVoiceMime('audio/webm;codecs=opus')).toBe('audio/webm');
		expect(voiceFileName('audio/mp4', 42)).toBe('voz-42.m4a');
		expect(voiceFileName('', 42)).toBe('voz-42.webm');
	});
});
