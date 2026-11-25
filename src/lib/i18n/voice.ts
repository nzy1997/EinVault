import type { Locale } from './index';

const en = {
	title: 'Voice log',
	hint: 'Say what happened and when. For a meal, include the amount eaten in grams.',
	example: 'Example in Chinese: 今天中午十二点吃了十五克。',
	noCats: 'Add a cat profile to start recording.',
	cat: 'Cat',
	record: 'Start recording',
	stop: 'Stop recording',
	recording: 'Recording…',
	upload: 'Upload an audio file',
	audioLabel: 'Recorded audio',
	send: 'Send recording',
	processing: 'Transcribing on the computer…',
	loadingError: 'The microphone could not be opened. You can upload a recording instead.',
	https:
		'Microphone recording requires a trusted HTTPS address on your phone. Audio uploads are available here.',
	audioError: 'Choose a supported audio recording under 4 MB and 30 seconds.',
	engine: 'Local transcription is unavailable. Recordings will remain in the review queue.',
	pending: 'Needs review',
	queued: 'Recording added to the review queue.',
	saved: 'Activity saved',
	empty: 'No recordings to review.',
	transcript: 'Transcript',
	refresh: 'Refresh queue',
	time: 'Date and time',
	amount: 'Amount eaten',
	grams: '{amount} g',
	type: 'Activity',
	choose: 'Choose an activity',
	subtype: 'Litter box activity',
	notes: 'Notes',
	save: 'Confirm and save',
	discard: 'Discard',
	discarded: 'Recording discarded.',
	retry: 'Retry transcription',
	invalid: 'Check the activity, date and amount before saving.',
	full: 'The review queue is full. Review an existing recording before adding another.',
	archived: 'This cat is archived. You can replay or discard the recording.',
	untranscribed: 'This recording has not been transcribed yet.',
	issues: {
		time: 'Confirm the date and time.',
		amount: 'Confirm how many grams were eaten.',
		activity: 'Confirm what happened.',
		transcription: 'Could not transcribe this recording. Replay it or try transcription again.',
		uncertain: 'Replay the recording and confirm the numbers the system heard.',
		recording: 'This recording could not be decoded or was too long.'
	}
};

const zhCN: typeof en = {
	title: '语音记录',
	hint: '说出发生了什么、是什么时候。记录喂食时，请说小猫实际吃了多少克。',
	example: '例如「今天中午十二点吃了十五克」',
	noCats: '添加一只小猫，开始语音记录。',
	cat: '猫咪',
	record: '开始录音',
	stop: '停止录音',
	recording: '正在录音…',
	upload: '上传音频文件',
	audioLabel: '录音',
	send: '发送录音',
	processing: '正在电脑上转写…',
	loadingError: '无法打开麦克风，可以改为上传录音。',
	https: '手机网页录音需要可信的 HTTPS 地址。你可以在这里上传已有录音。',
	audioError: '请选择支持的音频，时长不超过 30 秒，文件不超过 4 MB。',
	engine: '本地转写暂不可用，录音会先留在待确认列表。',
	pending: '待确认',
	queued: '已加入待确认列表。',
	saved: '已保存活动记录',
	empty: '没有待确认的录音。',
	transcript: '转写原文',
	refresh: '刷新待确认列表',
	time: '日期和时间',
	amount: '实际食量',
	grams: '{amount} 克',
	type: '活动',
	choose: '请选择活动',
	subtype: '猫砂盆活动',
	notes: '备注',
	save: '确认并保存',
	discard: '丢弃',
	discarded: '录音已丢弃。',
	retry: '重新转写',
	invalid: '请检查活动、日期和食量，再保存。',
	full: '待确认列表已满，请先处理一条录音。',
	archived: '这只猫已归档，你仍然可以回放或丢弃录音。',
	untranscribed: '这条录音还未转写。',
	issues: {
		time: '请确认日期和时间。',
		amount: '请确认实际吃了多少克。',
		activity: '请确认发生了什么。',
		transcription: '暂时无法转写，可以回听录音或重新转写。',
		uncertain: '数字可能听错了，请回放录音确认。',
		recording: '无法读取这段录音，或录音超过时长限制。'
	}
};

export function voiceCopy(locale: Locale) {
	return locale === 'zh-CN' ? zhCN : en;
}

export function formatMealGrams(locale: Locale, amount: number) {
	return voiceCopy(locale).grams.replace(
		'{amount}',
		new Intl.NumberFormat(locale, {
			maximumFractionDigits: 3
		}).format(amount)
	);
}
