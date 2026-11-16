<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { urlProvider } from '#lib/utils/url-provider.js';
	import { Check, Share2 } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';
	import Input from '../atoms/Input.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	/** How long the check mark stays after a successful copy. */
	const COPIED_MS = 2000;

	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	/** The manual-copy fallback: set when the clipboard refused, so the user can copy by hand. */
	let manualOpen = $state(false);
	let manualUrl = $state('');

	$effect(() => () => clearTimeout(copiedTimer));

	async function handleClick() {
		let url = '';
		try {
			url = urlProvider.getCurrentURL();
			// `navigator.clipboard` is undefined outside a secure context (plain HTTP), and
			// `writeText` rejects when permission is refused. Both land in the catch below.
			await navigator.clipboard.writeText(url);
			// The success toast is the screen-reader announcement (sonner's region is polite);
			// the check mark is the same news for everyone who isn't listening for it.
			toast.success(m.share_button_on_click());
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), COPIED_MS);
		} catch {
			if (url) {
				manualUrl = url;
				manualOpen = true;
			} else {
				toast.error(m.share_button_copy_failed());
			}
		}
	}

	/**
	 * The popover trigger only anchors the panel here. Its own click / key handlers would
	 * toggle the panel open on every press, whereas it should open only after a failed copy.
	 */
	function anchorProps(props: Record<string, unknown>) {
		const anchor = { ...props };
		delete anchor.onclick;
		delete anchor.onkeydown;
		delete anchor['aria-expanded'];
		delete anchor['aria-controls'];
		delete anchor['aria-haspopup'];
		return anchor;
	}

	/** Focus the field with its text selected, so Ctrl+C is the only step left. */
	function focusAndSelect(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<PopoverPanel
	bind:open={manualOpen}
	label={m.share_button_url_label()}
	contentClass="w-80 max-w-[calc(100vw-1rem)] p-3"
>
	{#snippet trigger({ props })}
		<Button
			{...anchorProps(props)}
			label={m.share_button_label()}
			onclick={handleClick}
			variant="muted"
			size="toolbar"
		>
			{#snippet icon()}
				{#if copied}
					<Check class="h-4 w-4" aria-hidden="true" />
				{:else}
					<Share2 class="h-4 w-4" aria-hidden="true" />
				{/if}
			{/snippet}
		</Button>
	{/snippet}
	<div class="flex flex-col gap-2">
		<p class="text-sm text-base-content/80">{m.share_button_manual_copy()}</p>
		<Input
			label={m.share_button_url_label()}
			value={manualUrl}
			readonly
			class="flex-col"
			onfocus={(e: FocusEvent) => (e.currentTarget as HTMLInputElement).select()}
			{@attach focusAndSelect}
		/>
	</div>
</PopoverPanel>
