<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Mic, Square, Upload } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import VoiceReviewCard from '#lib/components/voice/VoiceReviewCard.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { voiceCopy, formatMealGrams } from '#lib/i18n/voice.js';
	import {
		readVoiceAudioType,
		VOICE_AUDIO_TYPES,
		VOICE_MAX_BYTES,
		VOICE_MAX_SECONDS
	} from '#lib/voice.js';

	let { data, form }: PageProps = $props();
	const locale = getLocale();
	const copy = voiceCopy(locale);
	let canRecord = $state<boolean | null>(null);
	let recording = $state(false);
	let requestingMicrophone = $state(false);
	let submitting = $state(false);
	let captureError = $state('');
	let recorded = $state<Blob | null>(null);
	let previewUrl = $state('');
	let selectedFile = $state<File | null>(null);
	let currentCaptureId = $state('');
	let fileInput = $state<HTMLInputElement>();
	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setTimeout>;
	let disposed = false;

	function startNewCapture() {
		// Keep the ID on upload retries and rotate it if the user chooses new audio.
		currentCaptureId = currentCaptureId
			? Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) =>
					byte.toString(16).padStart(2, '0')
				).join('')
			: data.captureId;
	}

	function clearRecording() {
		recorded = null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
	}

	function releaseMicrophone() {
		clearTimeout(timer);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	onMount(() => {
		canRecord = Boolean(
			typeof navigator.mediaDevices?.getUserMedia === 'function' &&
			typeof MediaRecorder !== 'undefined'
		);
		selectedFile = fileInput?.files?.item(0) ?? null;
		if (selectedFile) startNewCapture();
		return () => {
			disposed = true;
			if (recorder?.state === 'recording') recorder.stop();
			releaseMicrophone();
			clearRecording();
		};
	});

	async function startRecording() {
		requestingMicrophone = true;
		captureError = '';
		try {
			const incoming = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (disposed) {
				incoming.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = incoming;
			const preferred = VOICE_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
			const media = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
			recorder = media;
			startNewCapture();
			clearRecording();
			if (fileInput) fileInput.value = '';
			selectedFile = null;

			const chunks: Blob[] = [];
			media.ondataavailable = ({ data }) => {
				if (data.size) chunks.push(data);
			};
			media.onerror = () => {
				captureError = copy.loadingError;
				chunks.length = 0;
				recording = false;
				releaseMicrophone();
			};
			media.onstop = () => {
				releaseMicrophone();
				recording = false;
				if (disposed || !chunks.length) return;
				const type = readVoiceAudioType(chunks[0].type || media.mimeType);
				const audio = new Blob(chunks, { type });
				if (!type || audio.size > VOICE_MAX_BYTES) {
					captureError = copy.audioError;
					return;
				}
				recorded = audio;
				previewUrl = URL.createObjectURL(audio);
			};
			media.start();
			recording = true;
			timer = setTimeout(() => {
				if (media.state === 'recording') media.stop();
			}, VOICE_MAX_SECONDS * 1_000);
		} catch {
			captureError = copy.loadingError;
			releaseMicrophone();
		} finally {
			requestingMicrophone = false;
		}
	}
</script>

<svelte:head><title>{copy.title} | EinVault</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader title={copy.title} subtitle={copy.hint} tint="primary">
		{#snippet icon()}<Mic class="size-5" />{/snippet}
	</PageHeader>

	{#if form && 'status' in form}
		<div class="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
			{#if form.status === 'saved' && form.draft?.type}
				<strong>{copy.saved}</strong>
				· {t(locale, `enum.activityType.${form.draft.type}`)}
				{#if form.draft.amountGrams !== null}
					· {formatMealGrams(locale, form.draft.amountGrams)}{/if}
				{#if form.draft.loggedAt}
					· <LocalTime date={form.draft.loggedAt} format="datetime" />{/if}
			{:else if form.status === 'pending'}
				{copy.queued} <a class="ml-1 underline" href="#{form.id}">{copy.pending}</a>
				{#if form.draft?.issue}<p class="mt-1">{copy.issues[form.draft.issue]}</p>{/if}
			{:else if form.status === 'discarded'}
				{copy.discarded}
			{/if}
		</div>
	{/if}

	{#if data.cats.length > 0}
		<form
			method="POST"
			action="?/capture"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				submitting = true;
				captureError = '';
				if (recorded) formData.set('audio', recorded, 'recording');
				return async ({ result, update }) => {
					try {
						if (result.type === 'error') {
							captureError = t(locale, 'media.actionFailed');
							return;
						}
						if (result.type === 'success') {
							clearRecording();
							selectedFile = null;
							currentCaptureId = '';
							if (fileInput) fileInput.value = '';
						}
						await update({ reset: false });
					} finally {
						submitting = false;
					}
				};
			}}
			class="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
		>
			<input type="hidden" name="id" value={currentCaptureId || data.captureId} />
			<label class="grid gap-1.5 text-sm sm:max-w-xs">
				{copy.cat}
				<Select name="companionId" value={data.initialCatId} required>
					{#each data.cats as cat (cat.id)}
						<option value={cat.id}>{cat.name}</option>
					{/each}
				</Select>
			</label>
			<p class="text-sm text-muted-foreground">{copy.example}</p>
			{#if !data.engineReady}
				<p class="text-sm text-muted-foreground">{copy.engine}</p>
			{/if}
			{#if canRecord === true}
				<div class="flex flex-wrap items-center gap-3">
					{#if recording}
						<Button type="button" onclick={() => recorder?.stop()}>
							<Square class="size-4" />
							{copy.stop}
						</Button>
						<span class="text-sm text-coral" role="status">{copy.recording}</span>
					{:else}
						<Button
							type="button"
							variant="outline"
							onclick={startRecording}
							disabled={submitting || requestingMicrophone}
						>
							<Mic class="size-4" />
							{copy.record}
						</Button>
					{/if}
				</div>
			{:else if canRecord === false}
				<p class="text-sm text-muted-foreground">{copy.https}</p>
			{/if}
			{#if previewUrl}
				<audio class="h-11 w-full" controls aria-label={copy.audioLabel} src={previewUrl}></audio>
			{/if}
			<label class="grid gap-1.5 text-sm">
				{copy.upload}
				<input
					bind:this={fileInput}
					name="audio"
					type="file"
					accept={VOICE_AUDIO_TYPES.join(',')}
					disabled={canRecord === null || recording || submitting}
					onchange={(event) => {
						clearRecording();
						selectedFile = event.currentTarget.files?.[0] ?? null;
						if (selectedFile) startNewCapture();
						captureError = '';
					}}
					class="w-full min-w-0 rounded-md border border-input px-3 py-2 text-sm"
				/>
			</label>
			{#if captureError || (form && 'error' in form && !('id' in form))}
				<p class="text-sm text-coral" role="alert">
					{captureError || (form && 'error' in form ? form.error : '')}
				</p>
			{/if}
			<Button type="submit" disabled={recording || submitting || (!recorded && !selectedFile)}>
				<Upload class="size-4" />
				{submitting ? copy.processing : copy.send}
			</Button>
		</form>
	{:else}
		<p class="rounded-lg border border-border p-4 text-sm text-muted-foreground">{copy.noCats}</p>
	{/if}

	<section aria-labelledby="voice-review" class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id="voice-review" class="text-lg font-semibold">
				{copy.pending} ({data.pending.length})
			</h2>
			<Button type="button" variant="ghost" size="sm" onclick={() => invalidate('app:voice')}
				>{copy.refresh}</Button
			>
		</div>
		{#each data.pending as item (item.id)}
			<VoiceReviewCard
				{item}
				problem={form && 'error' in form && 'id' in form && form.id === item.id
					? form.error
					: undefined}
			/>
		{:else}
			<p class="text-sm text-muted-foreground">{copy.empty}</p>
		{/each}
	</section>
</div>
