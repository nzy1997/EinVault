<script lang="ts">
	import { getLocale, t } from '#lib/i18n/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	let {
		value = $bindable(),
		multiple = false
	}: {
		value?: number;
		multiple?: boolean;
	} = $props();
	const locale = getLocale();
	const id = $props.id();
</script>

<div class="space-y-1.5">
	<Label for={id}>
		{t(locale, multiple ? 'page.log.mealAmountPerPet' : 'page.log.mealAmount')}
		<span class="font-normal text-muted-foreground">{t(locale, 'page.log.notesOptional')}</span>
	</Label>
	<Input {id} name="amountGrams" type="number" inputmode="decimal" min="0" step="any" bind:value />
</div>
