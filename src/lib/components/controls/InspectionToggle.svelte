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
		'flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
		enabled
			? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
			: 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800'
	].join(' ')}
>
	{m.inspection_toggle_label()}
	<span class="h-4 w-px {enabled ? 'bg-zinc-600 dark:bg-zinc-400' : 'bg-zinc-300 dark:bg-zinc-600'}"></span>
	<span class="font-semibold">{enabled ? 'ON' : 'OFF'}</span>
</button>
