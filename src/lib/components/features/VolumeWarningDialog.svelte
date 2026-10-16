<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as m from '#lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';

	/**
	 * The volume warning: a write to a hardware EQ can pop, drop out or jump in level mid-playback,
	 * and a test signal can start loud, so the user is asked to pause or lower the volume first.
	 * Two callers: this page's own (`volumeWarning`, from AppShell) and uniPEQ's for its device
	 * (`status.consent`, from LinkDialogs), told apart by `device`. Escape or a click outside is
	 * Not now.
	 */
	let {
		open,
		device = null,
		onAnswer
	}: {
		open: boolean;
		/** uniPEQ's device, when the warning is uniPEQ's; null for this page's own. */
		device?: string | null;
		onAnswer: (go: boolean, quiet: boolean) => void;
	} = $props();

	let quiet = $state(false);
</script>

<Dialog.Root {open} onOpenChange={(next) => !next && onAnswer(false, false)}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-base-200 p-6 shadow-2xl"
		>
			<Dialog.Title class="text-lg font-semibold text-base-content">
				{m.volume_warning_title()}
			</Dialog.Title>
			<Dialog.Description class="text-sm text-base-content/70">
				{device === null ? m.volume_warning_body() : m.volume_warning_body_unipeq({ device })}
			</Dialog.Description>
			<label class="flex items-center gap-2 text-sm text-base-content/80">
				<input type="checkbox" class="size-4 accent-primary" bind:checked={quiet} />
				{m.volume_warning_quiet()}
			</label>
			<div class="flex justify-end gap-2">
				<Button
					title={m.volume_warning_later()}
					variant="ghost"
					size="sm"
					onclick={() => onAnswer(false, false)}
				>
					{m.volume_warning_later()}
				</Button>
				<Button
					title={m.volume_warning_continue()}
					variant="primary"
					size="sm"
					onclick={() => onAnswer(true, quiet)}
				>
					{m.volume_warning_continue()}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
