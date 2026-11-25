import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVoiceCapture } from '#lib/server/voice-captures.js';
import { parseRange } from '#lib/server/storage/local.js';

export const GET: RequestHandler = ({ locals, params, request }) => {
	if (!locals.user || locals.user.role === 'caretaker') error(404);
	const capture = getVoiceCapture(params.id, locals.user.id);
	if (capture?.status !== 'pending' || !capture.audio) error(404);
	const audio = capture.audio;
	const range = parseRange(request.headers.get('range'), audio.length);
	const headers = new Headers({
		'Content-Type': capture.mimeType,
		'Cache-Control': 'private, no-store',
		'X-Content-Type-Options': 'nosniff',
		'Accept-Ranges': 'bytes',
		'Content-Length': String(range ? range.end - range.start + 1 : audio.length)
	});
	if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${audio.length}`);
	const bytes = range ? audio.subarray(range.start, range.end + 1) : audio;
	return new Response(Uint8Array.from(bytes), { headers, status: range ? 206 : 200 });
};
