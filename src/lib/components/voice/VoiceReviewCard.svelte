<script lang="ts">
	import { enhance } from '$app/forms';
	import { localDatetimes } from '#lib/actions/localDatetimes.js';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import MealAmountField from '#lib/components/log/MealAmountField.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { voiceCopy } from '#lib/i18n/voice.js';
	import { VOICE_ACTIVITY_TYPES, VOICE_LITTER_SUBTYPES, type VoiceDraft } from '#lib/voice.js';

	let {
		item,
		problem
	}: {
		item: {
			id: string;
			companionName: string;
			isActive: boolean;
			createdAt: Date;
			transcript: string | null;
			draft: VoiceDraft | null;
		};
		problem?: string;
	} = $props();

	const locale = getLocale();
	const copy = voiceCopy(locale);
	let type = $derived(item.draft?.type ?? '');
	let busy = $state(false);

	function localInput(value: string | null | undefined) {
		if (!value) return '';
		const d = new Date(value);
		return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
	}

	function submit() {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	}
</script>

<article id={item.id} class="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div class="min-w-0">
			<h3 class="break-words font-semibold">{item.companionName}</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				{item.draft?.issue ? copy.issues[item.draft.issue] : copy.untranscribed}
			</p>
		</div>
		<span class="text-xs text-muted-foreground">
			<LocalTime date={item.createdAt} format="datetime" />
		</span>
	</div>

	{#if item.transcript}
		<div class="rounded-lg bg-muted/50 p-3 text-sm">
			<div class="mb-1 text-xs text-muted-foreground">{copy.transcript}</div>
			<p class="break-words">{item.transcript}</p>
		</div>
	{/if}
	<audio
		class="h-11 w-full"
		aria-label={copy.audioLabel}
		controls
		preload="none"
		src="/voice/{item.id}/audio"
	></audio>

	{#if problem}
		<p class="text-sm text-coral" role="alert">{problem}</p>
	{/if}

	{#if item.isActive}
		<form
			method="POST"
			action="?/confirm"
			use:enhance={submit}
			use:localDatetimes
			class="space-y-3"
		>
			<input type="hidden" name="id" value={item.id} />
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid min-w-0 gap-1.5 text-sm">
					{copy.type}
					<Select name="type" bind:value={type} required>
						<option value="">{copy.choose}</option>
						{#each VOICE_ACTIVITY_TYPES as option (option)}
							<option value={option}>{t(locale, `enum.activityType.${option}`)}</option>
						{/each}
					</Select>
				</label>
				<label class="grid min-w-0 gap-1.5 text-sm">
					{copy.time}
					<Input
						type="datetime-local"
						name="loggedAt"
						value={localInput(item.draft?.loggedAt)}
						required
					/>
				</label>
				{#if type === 'meal'}
					<MealAmountField value={item.draft?.amountGrams ?? undefined} />
				{:else if type === 'litter'}
					<label class="grid min-w-0 gap-1.5 text-sm">
						{copy.subtype}
						<Select name="subtype" value={item.draft?.subtype ?? ''}>
							<option value="">—</option>
							{#each VOICE_LITTER_SUBTYPES as option (option)}
								<option value={option}>{t(locale, `enum.activitySubtype.${option}`)}</option>
							{/each}
						</Select>
					</label>
				{/if}
			</div>
			<label class="grid gap-1.5 text-sm">
				{copy.notes}
				<textarea
					name="notes"
					rows="2"
					value={item.transcript ?? ''}
					class="rounded-md border border-input bg-background px-3 py-2 text-sm"></textarea>
			</label>
			<Button type="submit" disabled={busy}>{copy.save}</Button>
		</form>
	{:else}
		<p class="text-sm text-muted-foreground">{copy.archived}</p>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#if !item.transcript && item.isActive}
			<form method="POST" action="?/retry" use:enhance={submit}>
				<input type="hidden" name="id" value={item.id} />
				<Button type="submit" variant="outline" size="sm" disabled={busy}>{copy.retry}</Button>
			</form>
		{/if}
		<form method="POST" action="?/discard" use:enhance={submit}>
			<input type="hidden" name="id" value={item.id} />
			<Button type="submit" variant="ghost" size="sm" disabled={busy}>{copy.discard}</Button>
		</form>
	</div>
</article>
