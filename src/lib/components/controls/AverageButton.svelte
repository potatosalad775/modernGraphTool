<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { Sigma } from '@lucide/svelte';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { isAveragable } from '$lib/utils/fr-average.js';
	import Button from '../atoms/Button.svelte';

	// Recomputed from the store rather than mirrored into local state — the button
	// has to re-enable itself when a curve is hidden, removed or channel-switched
	// from anywhere, including undo/redo.
	let count = $derived([...frStore.entries.values()].filter(isAveragable).length);
	let enabled = $derived(count >= 2);

	function handleClick() {
		const averaged = dataProvider.averageVisiblePhones({
			identifier: m.average_curve_name(),
			dispSuffix: m.average_curve_suffix({ count })
		});
		if (averaged === 0) {
			toast.error(m.average_button_needs_two());
			return;
		}
		toast.success(m.average_button_done({ count: averaged }));
	}
</script>

<Button
	title={enabled ? m.average_button_hint() : m.average_button_needs_two()}
	onclick={handleClick}
	disabled={!enabled}
	variant="muted"
	size="toolbar"
>
	<Sigma class="h-4 w-4" aria-hidden="true" />
	{m.average_button_label()}
</Button>
