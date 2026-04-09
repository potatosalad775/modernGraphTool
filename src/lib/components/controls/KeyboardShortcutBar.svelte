<script lang="ts">
	import { onMount } from 'svelte';
	import { commandHistory } from '$lib/services/command-history.svelte';
	import * as m from '$lib/paraglide/messages';

	let isMac = $state(false);

	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
	});

	let modKey = $derived(isMac ? '\u2318' : 'Ctrl+');
</script>

<div
	class="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-base-content/20 px-3 py-2 mt-auto text-xs text-base-content/85 bg-base-200 select-none"
>
	<span class="inline-flex items-center gap-1.5 transition-opacity" class:opacity-30={!commandHistory.canUndo}>
		<kbd>{modKey}+Z</kbd>
		{m.keyboard_shortcut_undo()}
	</span>
	<span class="inline-flex items-center gap-1.5 transition-opacity" class:opacity-30={!commandHistory.canRedo}>
		<kbd>{modKey}+{isMac ? '\u21e7' : 'Shift+'}+Z</kbd>
		{m.keyboard_shortcut_redo()}
	</span>
	<span class="inline-flex items-center gap-1.5">
		<kbd>1</kbd>–<kbd>4</kbd>
		{m.keyboard_shortcut_panels()}
	</span>
</div>
