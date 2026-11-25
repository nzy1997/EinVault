import { and, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { prepareDailyEvents } from '#lib/server/daily-events.js';
import { VOICE_MAX_PENDING, type VoiceDraft } from '#lib/voice.js';
import { parseVoiceTranscript } from './voice-parser';
import { transcribeVoice } from './voice-transcription';

type VoiceUser = { id: string; role: 'admin' | 'member' };
type Capture = typeof schema.voiceCaptures.$inferSelect;
type NewCapture = Pick<Capture, 'id' | 'companionId' | 'mimeType' | 'audio'>;
type FinalDraft = VoiceDraft & { type: NonNullable<VoiceDraft['type']>; loggedAt: string };

const captures = schema.voiceCaptures;
const processing = new Set<string>();

function owner(id: string, userId: string) {
	return and(eq(captures.id, id), eq(captures.userId, userId));
}

export function getVoiceCapture(id: string, userId: string) {
	return db.select().from(captures).where(owner(id, userId)).get();
}

export function listVoiceCaptures(userId: string) {
	return db
		.select({
			id: captures.id,
			companionId: captures.companionId,
			companionName: schema.companions.name,
			isActive: schema.companions.isActive,
			createdAt: captures.createdAt,
			transcript: captures.transcript,
			draft: captures.draft
		})
		.from(captures)
		.innerJoin(schema.companions, eq(captures.companionId, schema.companions.id))
		.where(and(eq(captures.userId, userId), eq(captures.status, 'pending')))
		.orderBy(desc(captures.createdAt), desc(captures.id))
		.all();
}

export function queueVoiceCapture(user: VoiceUser, input: NewCapture) {
	return db.transaction(
		(tx) => {
			const existing = tx.select().from(captures).where(eq(captures.id, input.id)).get();
			if (existing) return existing.userId === user.id ? existing : null;
			const pending = tx
				.select({ total: count() })
				.from(captures)
				.where(and(eq(captures.userId, user.id), eq(captures.status, 'pending')))
				.get();
			if ((pending?.total ?? 0) >= VOICE_MAX_PENDING) return null;
			return tx
				.insert(captures)
				.values({ ...input, userId: user.id, status: 'pending', createdAt: new Date() })
				.returning()
				.get();
		},
		{ behavior: 'immediate' }
	);
}

export async function saveVoiceCapture(
	user: VoiceUser,
	capture: Capture,
	draft: FinalDraft,
	notes: string | null
) {
	const prepared = await prepareDailyEvents(
		user,
		[capture.companionId],
		{
			type: draft.type,
			loggedAt: new Date(draft.loggedAt),
			amountGrams: draft.amountGrams,
			subtypes: draft.subtype ? [draft.subtype] : null,
			notes,
			durationMinutes: null
		},
		{ rejectUnusableSubtypes: true }
	);
	if (!prepared.ok) return null;

	return db.transaction(
		(tx) => {
			const latest = tx.select().from(captures).where(owner(capture.id, user.id)).get();
			if (latest?.status !== 'pending') return latest;
			const active = tx
				.select({ isActive: schema.companions.isActive })
				.from(schema.companions)
				.where(eq(schema.companions.id, capture.companionId))
				.get();
			if (!active?.isActive) return null;
			tx.insert(schema.dailyEvents).values(prepared.rows).run();
			return tx
				.update(captures)
				.set({ status: 'saved', draft, audio: null, eventId: prepared.rows[0].id })
				.where(owner(capture.id, user.id))
				.returning()
				.get();
		},
		{ behavior: 'immediate' }
	);
}

export async function processVoiceCapture(user: VoiceUser, capture: Capture) {
	if (
		capture.status !== 'pending' ||
		!capture.audio ||
		capture.transcript ||
		processing.has(capture.id)
	) {
		return capture;
	}

	processing.add(capture.id);
	try {
		const result = await transcribeVoice(capture.audio, capture.mimeType);
		const draft: VoiceDraft = result.transcript
			? parseVoiceTranscript(result.transcript, capture.createdAt)
			: { type: null, loggedAt: null, amountGrams: null, subtype: null, issue: result.issue };
		draft.issue ??= result.issue;
		const pending = db
			.update(captures)
			.set({ transcript: result.transcript, draft })
			.where(and(owner(capture.id, user.id), eq(captures.status, 'pending')))
			.returning()
			.get();
		if (pending && !draft.issue && draft.type && draft.loggedAt) {
			const saved = await saveVoiceCapture(
				user,
				pending,
				{
					...draft,
					type: draft.type,
					loggedAt: draft.loggedAt
				},
				result.transcript
			);
			if (saved) return saved;
		}
		return getVoiceCapture(capture.id, user.id) ?? capture;
	} finally {
		processing.delete(capture.id);
	}
}

export function discardVoiceCapture(id: string, userId: string) {
	return (
		db
			.update(captures)
			.set({ status: 'discarded', audio: null, draft: null, transcript: null })
			.where(and(owner(id, userId), eq(captures.status, 'pending')))
			.run().changes > 0
	);
}
