<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { eqChannelConflict } from '#lib/services/eq-channel-conflict.svelte.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';

	/**
	 * Remove the left/right-only bands, or keep them and leave the restriction off. Mounted once in
	 * AppShell: a device can connect with the Equalizer panel closed. Escape or a click outside is
	 * the keep choice, which removes nothing.
	 */
	const question = $derived(eqChannelConflict.question);
	const keepLabel = $derived(
		question?.kind === 'device'
			? m.eq_channel_conflict_keep_device()
			: question?.kind === 'restriction'
				? m.eq_channel_conflict_keep_restriction()
				: m.eq_channel_conflict_cancel()
	);
</script>

<Dialog
	open={question !== null}
	onOpenChange={(next) => !next && eqChannelConflict.answer(false)}
	title={m.eq_channel_conflict_title()}
	description={question
		? m.eq_channel_conflict_body({ count: question.count, label: question.label })
		: undefined}
>
	{#snippet actions()}
		<Button
			label={keepLabel}
			variant="ghost"
			size="sm"
			onclick={() => eqChannelConflict.answer(false)}
		/>
		<Button
			label={m.eq_channel_conflict_remove()}
			variant="primary"
			size="sm"
			onclick={() => eqChannelConflict.answer(true)}
		/>
	{/snippet}
</Dialog>
