<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';

	let enabled = $state(false);

	function handleClick() {
		enabled = !enabled;
		graphEngine.graphInspection?.setEnabled(enabled);
	}
</script>

<button
	onclick={handleClick}
	class={[
		'flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
		enabled
			? 'border-accent bg-accent text-accent-content'
			: 'border-base-content/20 text-base-content/60 hover:bg-base-300'
	].join(' ')}
>
	{m.inspection_toggle_label()}
	<span class="h-4 w-px {enabled ? 'bg-accent-content/30' : 'bg-base-content/20'}"></span>
	<span class="font-semibold">{enabled ? 'ON' : 'OFF'}</span>
</button>
