export const VOICE_MAX_SECONDS = 30;
export const VOICE_MAX_BYTES = 4 * 1024 * 1024;
export const VOICE_MAX_PENDING = 30;
export const VOICE_AUDIO_TYPES = [
	'audio/webm',
	'audio/mp4',
	'audio/aac',
	'audio/mpeg',
	'audio/ogg',
	'audio/wav',
	'audio/x-wav',
	'audio/x-m4a'
] as const;

export type VoiceAudioType = (typeof VOICE_AUDIO_TYPES)[number];

export function readVoiceAudioType(raw: string): VoiceAudioType | undefined {
	const base = raw.split(';')[0].trim().toLowerCase();
	return VOICE_AUDIO_TYPES.find((type) => type === base);
}

export const VOICE_ACTIVITY_TYPES = ['meal', 'litter', 'other'] as const;
export const VOICE_LITTER_SUBTYPES = ['pee', 'poop', 'scoop', 'change'] as const;

export type VoiceActivity = (typeof VOICE_ACTIVITY_TYPES)[number];
export type VoiceLitterSubtype = (typeof VOICE_LITTER_SUBTYPES)[number];
export type VoiceIssue =
	'time' | 'amount' | 'activity' | 'transcription' | 'recording' | 'uncertain';

export interface VoiceDraft {
	type: VoiceActivity | null;
	loggedAt: string | null;
	amountGrams: number | null;
	subtype: VoiceLitterSubtype | null;
	issue: VoiceIssue | null;
}

export function isMealAmount(value: number): boolean {
	return Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}
