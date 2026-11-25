import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { t } from '#lib/i18n/index.js';
import { voiceCopy } from '#lib/i18n/voice.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { parseLoggedAt } from '#lib/server/validation.js';
import {
	isMealAmount,
	readVoiceAudioType,
	VOICE_ACTIVITY_TYPES,
	VOICE_LITTER_SUBTYPES,
	VOICE_MAX_BYTES,
	type VoiceActivity,
	type VoiceLitterSubtype
} from '#lib/voice.js';
import {
	discardVoiceCapture,
	getVoiceCapture,
	listVoiceCaptures,
	processVoiceCapture,
	queueVoiceCapture,
	saveVoiceCapture
} from '#lib/server/voice-captures.js';
import { voiceEngineReady } from '#lib/server/voice-transcription.js';

const isCaptureId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

function requireVoiceUser(locals: RequestEvent['locals']) {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));
	return { id: locals.user.id, role: locals.user.role };
}

export const load: PageServerLoad = async ({ locals, parent, url, depends }) => {
	depends('app:voice');
	const user = requireVoiceUser(locals);
	const { companions } = await parent();
	const cats = companions
		.filter((companion) => companion.species === 'cat')
		.map(({ id, name }) => ({ id, name }));
	const requested = url.searchParams.get('companion');
	return {
		cats,
		initialCatId: cats.find((cat) => cat.id === requested)?.id ?? cats[0]?.id,
		captureId: randomUUID(),
		pending: listVoiceCaptures(user.id),
		engineReady: voiceEngineReady()
	};
};

export const actions: Actions = {
	capture: async ({ locals, request }) => {
		const user = requireVoiceUser(locals);
		const copy = voiceCopy(locals.locale);
		if (Number(request.headers.get('content-length')) > VOICE_MAX_BYTES + 65_536)
			return fail(413, { error: copy.audioError });

		const form = await request.formData();
		const file = form.get('audio');
		const id = String(form.get('id') ?? '');
		const companionId = String(form.get('companionId') ?? '');
		if (!(file instanceof File) || !file.size || file.size > VOICE_MAX_BYTES || !isCaptureId(id))
			return fail(400, { error: copy.audioError });
		const mimeType = readVoiceAudioType(file.type);
		if (!mimeType) return fail(400, { error: copy.audioError });

		const pet = await db.query.companions.findFirst({
			where: and(
				eq(schema.companions.id, companionId),
				eq(schema.companions.species, 'cat'),
				eq(schema.companions.isActive, true)
			),
			columns: { id: true }
		});
		if (!pet) return fail(400, { error: copy.noCats });

		const capture = queueVoiceCapture(user, {
			id,
			companionId,
			mimeType,
			audio: Buffer.from(await file.arrayBuffer())
		});
		if (!capture) return fail(409, { error: copy.full });
		const result = await processVoiceCapture(user, capture);
		return { id, status: result.status, draft: result.draft };
	},
	retry: async ({ locals, request }) => {
		const user = requireVoiceUser(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const capture = getVoiceCapture(id, user.id);
		if (!capture) return fail(404, { error: t(locals.locale, 'error.entryNotFound') });
		const result = await processVoiceCapture(user, capture);
		return { id, status: result.status, draft: result.draft };
	},
	confirm: async ({ locals, request }) => {
		const user = requireVoiceUser(locals);
		const copy = voiceCopy(locals.locale);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const capture = getVoiceCapture(id, user.id);
		if (!capture) return fail(404, { error: t(locals.locale, 'error.entryNotFound'), id });
		if (capture.status !== 'pending') return { id, status: capture.status, draft: capture.draft };

		const type = String(form.get('type') ?? '') as VoiceActivity;
		const subtype = String(form.get('subtype') ?? '') as VoiceLitterSubtype;
		const loggedAt = parseLoggedAt(form.get('loggedAt'));
		const rawAmount = String(form.get('amountGrams') ?? '').trim();
		const amountGrams = type === 'meal' && rawAmount ? Number(rawAmount) : null;
		const notes = String(form.get('notes') ?? '').trim();
		if (
			!VOICE_ACTIVITY_TYPES.includes(type) ||
			!loggedAt ||
			loggedAt.getTime() > Date.now() + 300_000 ||
			(amountGrams !== null && !isMealAmount(amountGrams)) ||
			(type === 'litter' && subtype && !VOICE_LITTER_SUBTYPES.includes(subtype)) ||
			notes.length > MAX_NOTE_LEN
		)
			return fail(400, { error: copy.invalid, id });

		const result = await saveVoiceCapture(
			user,
			capture,
			{
				type,
				loggedAt: loggedAt.toISOString(),
				amountGrams,
				subtype: type === 'litter' && subtype ? subtype : null,
				issue: null
			},
			notes || null
		);
		if (!result) return fail(409, { error: copy.archived, id });
		return { id, status: result.status, draft: result.draft };
	},
	discard: async ({ locals, request }) => {
		const user = requireVoiceUser(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!discardVoiceCapture(id, user.id))
			return fail(404, { error: t(locals.locale, 'error.entryNotFound'), id });
		return { id, status: 'discarded' as const, draft: null };
	}
};
