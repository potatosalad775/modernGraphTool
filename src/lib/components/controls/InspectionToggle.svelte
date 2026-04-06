<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import Button from '../atoms/Button.svelte';

	let enabled = $state(false);

	function handleClick() {
		enabled = !enabled;
		graphEngine.graphInspection?.setEnabled(enabled);
	}
</script>

<Button
	title={m.inspection_toggle_label()}
	onclick={handleClick}
	variant={enabled ? 'primary' : 'outline'}
	class="h-9! px-3! gap-1.5"
>
	{m.inspection_toggle_label()}
	<span class="h-5 w-px {enabled ? 'bg-accent-content/30' : 'bg-base-content/20'}"></span>
	<span class="font-semibold">{enabled ? 'ON' : 'OFF'}</span>
</Button>
