import { describe, expect, it } from 'vitest';
import { parseVoiceTranscript } from './voice-parser';

const received = new Date(2026, 10, 25, 20);
const noon = new Date(2026, 10, 25, 12).toISOString();

describe('Chinese voice log parsing', () => {
	it.each(['今天中午十二点吃了十五克。', '今天中午12點吃了15克', '记录今天中午12:00吃饭15g'])(
		'recognizes a meal with an explicit amount and time: %s',
		(text) => {
			expect(parseVoiceTranscript(text, received)).toEqual({
				type: 'meal',
				loggedAt: noon,
				amountGrams: 15,
				subtype: null,
				issue: null
			});
		}
	);

	it('keeps decimal grams and a relative time', () => {
		expect(parseVoiceTranscript('刚才吃了十五点五克', received)).toMatchObject({
			type: 'meal',
			loggedAt: received.toISOString(),
			amountGrams: 15.5,
			issue: null
		});
	});

	it('identifies a specific litter event and earlier day', () => {
		expect(parseVoiceTranscript('昨天下午三点半排便一次。', received)).toMatchObject({
			type: 'litter',
			subtype: 'poop',
			loggedAt: new Date(2026, 10, 24, 15, 30).toISOString(),
			amountGrams: null,
			issue: null
		});
	});

	it('does not infer grams, an ambiguous clock time, or a future event', () => {
		expect(parseVoiceTranscript('今天中午十二点吃了十五', received)).toMatchObject({
			type: 'meal',
			amountGrams: null,
			issue: 'amount'
		});
		expect(parseVoiceTranscript('十二点吃饭15g', received)).toMatchObject({
			amountGrams: 15,
			loggedAt: null,
			issue: 'time'
		});
		expect(parseVoiceTranscript('今天晚上九点吃了15克', received)).toMatchObject({
			amountGrams: 15,
			loggedAt: null,
			issue: 'time'
		});
		expect(parseVoiceTranscript('昨天晚上十二点吃了15克', received)).toMatchObject({
			loggedAt: null,
			issue: 'time'
		});
		expect(parseVoiceTranscript('今天中午十二点吃了一百五克', received)).toMatchObject({
			amountGrams: null,
			issue: 'amount'
		});
	});

	it('sends compound, negated and offered-food statements to review', () => {
		for (const transcript of ['刚才吃了十五克，然后吐了一次', '刚才没吃十五克', '刚才喂了十五克']) {
			expect(parseVoiceTranscript(transcript, received).issue).not.toBeNull();
		}
	});
});
