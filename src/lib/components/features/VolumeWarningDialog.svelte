<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';

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

<Dialog
	{open}
	onOpenChange={(next) => !next && onAnswer(false, false)}
	title={m.volume_warning_title()}
	description={device === null ? m.volume_warning_body() : m.volume_warning_body_unipeq({ device })}
>
	<label class="flex items-center gap-2 text-sm text-base-content/80">
		<input type="checkbox" class="size-4 accent-primary" bind:checked={quiet} />
		{m.volume_warning_quiet()}
	</label>
	{#snippet actions()}
		<Button
			label={m.volume_warning_later()}
			variant="ghost"
			size="sm"
			onclick={() => onAnswer(false, false)}
		/>
		<Button
			label={m.volume_warning_continue()}
			variant="primary"
			size="sm"
			onclick={() => onAnswer(true, quiet)}
		/>
	{/snippet}
</Dialog>
