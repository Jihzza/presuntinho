export const VOICE_MIME_PREFERENCES = [
	'audio/webm;codecs=opus',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/webm'
] as const;

const VOICE_EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/mp4': 'm4a',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav'
};

/** Pick a codec the current browser can actually record. */
export function preferredVoiceMime(
	isSupported: ((mimeType: string) => boolean) | undefined
): string | undefined {
	if (!isSupported) return undefined;
	return VOICE_MIME_PREFERENCES.find((mimeType) => isSupported(mimeType));
}

/** MediaRecorder may include codec parameters; upload validation needs the bare type. */
export function normalizeVoiceMime(mimeType: string | null | undefined): string {
	const bare = (mimeType ?? '').split(';', 1)[0].trim().toLowerCase();
	return bare.startsWith('audio/') ? bare : 'audio/webm';
}

export function voiceFileName(mimeType: string, timestamp = Date.now()): string {
	const normalized = normalizeVoiceMime(mimeType);
	return `voz-${Math.max(0, Math.floor(timestamp))}.${VOICE_EXTENSIONS[normalized] ?? 'webm'}`;
}

/** Stable mm:ss label shared by the live counter and the recorded preview. */
export function formatVoiceDuration(durationMs: number): string {
	const safeMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
	const seconds = Math.floor(safeMs / 1_000);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
