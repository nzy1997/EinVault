import { isMealAmount } from '#lib/activityTypes.js';
import type { VoiceDraft, VoiceLitterSubtype } from '#lib/voice.js';

const DIGITS = '零一二三四五六七八九';
const NUMERAL = '[0-9零〇一二两三四五六七八九十百千]+';
const CLOCK = new RegExp(
	`^(?:(今天|昨天|前天))?(凌晨|早上|上午|中午|下午|晚上)?(${NUMERAL})(?:[:：]([0-9]{2})|点(?:(${NUMERAL})分?|([半]))?)[,，]?(.*)$`
);
const MEAL = new RegExp(
	`^(?:吃(?:了|饭)?(?:了)?|进食(?:了)?)(${NUMERAL}(?:[.点]${NUMERAL})?)(?:克|公克|g)(?:猫粮|干粮|湿粮|罐头)?$`,
	'i'
);
const LITTER: ReadonlyArray<[RegExp, VoiceLitterSubtype]> = [
	[/^(?:排尿|尿尿|尿了|小便)(?:了|一次|1次)?$/, 'pee'],
	[/^(?:排便|便便|拉屎|拉了屎|大便)(?:了|一次|1次)?$/, 'poop'],
	[/^(?:铲砂|铲猫砂|铲了猫砂)(?:了)?$/, 'scoop'],
	[/^(?:换猫砂|换了猫砂)(?:了)?$/, 'change']
];

function wholeNumber(value: string): number {
	if (/^\d+$/.test(value)) return Number(value);
	// Spoken shorthand such as 一百五 can mean 150; require the full amount.
	if (/[百千][一二两三四五六七八九]$/.test(value)) return NaN;
	let digit = 0;
	let result = 0;
	for (const char of value.replaceAll('〇', '零').replaceAll('两', '二')) {
		const factor = char === '十' ? 10 : char === '百' ? 100 : char === '千' ? 1000 : 0;
		if (factor) {
			result += (digit || 1) * factor;
			digit = 0;
		} else {
			const next = DIGITS.indexOf(char);
			if (next < 0) return NaN;
			digit = digit * 10 + next;
		}
	}
	return result + digit;
}

function grams(value: string): number {
	const [whole, fraction] = value.split(/[.点]/);
	const decimal =
		fraction && /^\d+$/.test(fraction)
			? fraction
			: [...(fraction ?? '')].map((char) => DIGITS.indexOf(char)).join('');
	return wholeNumber(whole) + (decimal ? Number(`0.${decimal}`) : 0);
}

function timeFromVoice(text: string, receivedAt: Date) {
	const relative = /^(现在|刚刚|刚才)[,，]?/.exec(text);
	if (relative) return { loggedAt: receivedAt.toISOString(), rest: text.slice(relative[0].length) };
	const match = CLOCK.exec(text);
	if (!match) return { loggedAt: null, rest: text };

	const [, day, period, rawHour, colonMinute, spokenMinute, half, rest] = match;
	let hour = wholeNumber(rawHour);
	const minute = colonMinute
		? Number(colonMinute)
		: spokenMinute
			? wholeNumber(spokenMinute)
			: half
				? 30
				: 0;
	if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) {
		return { loggedAt: null, rest };
	}
	switch (period) {
		case '凌晨':
			if (hour > 6 && hour !== 12) return { loggedAt: null, rest };
			if (hour === 12) hour = 0;
			break;
		case '早上':
		case '上午':
			if (hour < 1 || hour >= 12) return { loggedAt: null, rest };
			break;
		case '中午':
			if (hour < 11 || hour > 13) return { loggedAt: null, rest };
			break;
		case '晚上':
			if (hour === 0 || hour === 12) return { loggedAt: null, rest };
			if (hour < 12) hour += 12;
			break;
		case '下午':
			if (hour === 0 || hour > 18) return { loggedAt: null, rest };
			if (hour < 12) hour += 12;
			break;
		default:
			if (hour >= 1 && hour <= 12) return { loggedAt: null, rest };
	}

	const timestamp = new Date(receivedAt);
	timestamp.setDate(timestamp.getDate() - (day === '昨天' ? 1 : day === '前天' ? 2 : 0));
	timestamp.setHours(hour, minute, 0, 0);
	return {
		loggedAt: timestamp <= receivedAt ? timestamp.toISOString() : null,
		rest
	};
}

export function parseVoiceTranscript(transcript: string, receivedAt: Date): VoiceDraft {
	const text = transcript
		.normalize('NFKC')
		.replace(/\s/g, '')
		.replaceAll('點', '点')
		.replaceAll('兩', '两')
		.replaceAll('鏟', '铲')
		.replaceAll('換', '换')
		.replaceAll('貓', '猫')
		.replaceAll('糧', '粮')
		.replaceAll('進', '进')
		.replaceAll('記錄', '记录')
		.replace(/^(?:帮我)?(?:记录(?:一下)?)[,，:：]?/, '')
		.replace(/[。！？!?，,。]+$/, '');
	const { loggedAt, rest } = timeFromVoice(text, receivedAt);
	const activity = rest.replace(/^(?:小猫|猫咪)/, '');
	const meal = MEAL.exec(activity);
	const amount = meal ? grams(meal[1]) : NaN;
	const litter = LITTER.find(([pattern]) => pattern.test(activity));
	const type = meal || /^(吃|进食)/.test(activity) ? 'meal' : litter ? 'litter' : null;
	const amountGrams = isMealAmount(amount) ? amount : null;

	return {
		type,
		loggedAt,
		amountGrams,
		subtype: litter?.[1] ?? null,
		issue: !type
			? 'activity'
			: !loggedAt
				? 'time'
				: type === 'meal' && amountGrams === null
					? 'amount'
					: null
	};
}
