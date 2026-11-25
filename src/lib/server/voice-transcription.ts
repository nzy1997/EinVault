import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as env from '$app/env/private';
import { VOICE_MAX_SECONDS, type VoiceAudioType } from '#lib/voice.js';

const run = promisify(execFile);
const SAMPLE_RATE = 16_000;
const NUMBER_CONFIDENCE_MIN = 0.65;
const demuxers: Record<VoiceAudioType, string> = {
	'audio/webm': 'matroska',
	'audio/mp4': 'mov',
	'audio/aac': 'aac',
	'audio/mpeg': 'mp3',
	'audio/ogg': 'ogg',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/x-m4a': 'mov'
};

export function voiceEngineReady(): boolean {
	return Boolean(env.VOICE_WHISPER_BIN && env.VOICE_WHISPER_MODEL);
}

export async function transcribeVoice(
	audio: Buffer,
	mimeType: VoiceAudioType
): Promise<{
	transcript: string | null;
	issue: 'transcription' | 'recording' | 'uncertain' | null;
}> {
	if (!env.VOICE_WHISPER_BIN || !env.VOICE_WHISPER_MODEL) {
		return { transcript: null, issue: 'transcription' };
	}

	const temp = await mkdtemp(join(tmpdir(), 'einvault-voice-'));
	try {
		const source = join(temp, 'recording');
		const wav = join(temp, 'recording.wav');
		const output = join(temp, 'transcript');
		await writeFile(source, audio);
		try {
			await run(
				env.VOICE_FFMPEG_BIN || 'ffmpeg',
				[
					'-nostdin',
					'-v',
					'error',
					'-f',
					demuxers[mimeType],
					'-protocol_whitelist',
					'file,pipe',
					'-i',
					source,
					'-map',
					'0:a:0',
					'-vn',
					'-sn',
					'-dn',
					'-t',
					String(VOICE_MAX_SECONDS + 2),
					'-ar',
					String(SAMPLE_RATE),
					'-ac',
					'1',
					'-c:a',
					'pcm_s16le',
					wav
				],
				{ timeout: 15_000, maxBuffer: 1024 * 1024 }
			);
		} catch {
			return { transcript: null, issue: 'recording' };
		}

		// Allow a second for the browser's auto-stop timer and a WAV header.
		const { size } = await stat(wav);
		if (size < 80 || size > SAMPLE_RATE * 2 * (VOICE_MAX_SECONDS + 1) + 4_096) {
			return { transcript: null, issue: 'recording' };
		}

		await run(
			env.VOICE_WHISPER_BIN,
			['-m', env.VOICE_WHISPER_MODEL, '-l', 'zh', '-nt', '-ojf', '-of', output, '-f', wav],
			{ timeout: 90_000, maxBuffer: 1024 * 1024 }
		);
		const result: { transcription: { text: string; tokens: { text: string; p: number }[] }[] } =
			JSON.parse(await readFile(output + '.json', 'utf8'));
		const transcript = result.transcription
			.map(({ text }) => text)
			.join(' ')
			.trim()
			.slice(0, 1_000);
		if (!transcript) return { transcript: null, issue: 'transcription' };
		const uncertain = result.transcription.some(({ tokens }) =>
			tokens.some(
				({ text, p }) =>
					!text.startsWith('[_') &&
					/[0-9零〇一二两兩三四五六七八九十百千]/.test(text) &&
					p < NUMBER_CONFIDENCE_MIN
			)
		);
		return { transcript, issue: uncertain ? 'uncertain' : null };
	} catch {
		return { transcript: null, issue: 'transcription' };
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
}
