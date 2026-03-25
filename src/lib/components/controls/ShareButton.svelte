<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { urlProvider } from '$lib/utils/url-provider';

	let copied = $state(false);
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	async function handleClick() {
		const url = urlProvider.getCurrentURL();
		await navigator.clipboard.writeText(url);
		copied = true;
		if (timeoutId !== null) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			copied = false;
			timeoutId = null;
		}, 1000);
	}
</script>

<button
	onclick={handleClick}
	class="flex h-10 items-center gap-1.5 rounded-md bg-surface-hover px-3 text-sm font-medium text-foreground-secondary transition-colors hover:bg-handle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="h-4 w-4"
		aria-hidden="true"
	>
		<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
		<polyline points="16 6 12 2 8 6" />
		<line x1="12" y1="2" x2="12" y2="15" />
	</svg>
	{copied ? m.share_button_on_click() : m.share_button_label()}
</button>
