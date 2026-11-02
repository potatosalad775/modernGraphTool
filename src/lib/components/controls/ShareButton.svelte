<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { urlProvider } from '#lib/utils/url-provider.js';
	import { Share2 } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';

	async function handleClick() {
		try {
			const url = urlProvider.getCurrentURL();
			await navigator.clipboard.writeText(url);
			toast.success(m.share_button_on_click());
		} catch {
			toast.error(m.share_button_copy_failed());
		}
	}
</script>

<Button label={m.share_button_label()} onclick={handleClick} variant="muted" size="toolbar">
	{#snippet icon()}<Share2 class="h-4 w-4" aria-hidden="true" />{/snippet}
</Button>
