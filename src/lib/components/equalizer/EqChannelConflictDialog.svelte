<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as m from '#lib/paraglide/messages.js';
	import { eqChannelConflict } from '#lib/services/eq-channel-conflict.svelte.js';
	import Button from '../atoms/Button.svelte';

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

<Dialog.Root
	open={question !== null}
	onOpenChange={(next) => !next && eqChannelConflict.answer(false)}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-base-200 p-6 shadow-2xl"
		>
			<Dialog.Title class="text-lg font-semibold text-base-content">
				{m.eq_channel_conflict_title()}
			</Dialog.Title>
			{#if question}
				<Dialog.Description class="text-sm text-base-content/70">
					{m.eq_channel_conflict_body({ count: question.count, label: question.label })}
				</Dialog.Description>
			{/if}
			<div class="flex flex-wrap justify-end gap-2">
				<Button
					title={keepLabel}
					variant="ghost"
					size="sm"
					onclick={() => eqChannelConflict.answer(false)}
				>
					{keepLabel}
				</Button>
				<Button
					title={m.eq_channel_conflict_remove()}
					variant="primary"
					size="sm"
					onclick={() => eqChannelConflict.answer(true)}
				>
					{m.eq_channel_conflict_remove()}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
