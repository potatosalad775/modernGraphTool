<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { graphEngine } from '#lib/graph/GraphEngine.svelte.js';
	import Button from '../atoms/Button.svelte';

	// GraphInspection outlives this button — on mobile it unmounts with GraphPanel — so start
	// from the engine's state rather than assuming off.
	let enabled = $state(graphEngine.graphInspection?.isEnabled ?? false);

	function handleClick() {
		enabled = !enabled;
		graphEngine.graphInspection?.setEnabled(enabled);
	}
</script>

<Button
	title={m.inspection_toggle_label()}
	onclick={handleClick}
	variant={enabled ? 'primary' : 'outline'}
	size="toolbar"
>
	{m.inspection_toggle_label()}
	<span class="h-5 w-px {enabled ? 'bg-accent-content/30' : 'bg-base-content/20'}"></span>
	<span class="font-semibold">{enabled ? 'ON' : 'OFF'}</span>
</Button>
