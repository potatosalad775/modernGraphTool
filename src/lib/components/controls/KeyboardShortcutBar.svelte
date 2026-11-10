<script lang="ts">
	import { onMount } from 'svelte';
	import { commandHistory } from '#lib/services/command-history.svelte.js';
	import { menuStore } from '#lib/stores/menu-store.svelte.js';
	import * as m from '#lib/paraglide/messages.js';

	let isMac = $state(false);

	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
	});

	let modKey = $derived(isMac ? '\u2318' : 'Ctrl');
	let shiftKey = $derived(isMac ? '\u21e7' : 'Shift');
</script>

<div
	data-tutorial-target="keyboard"
	class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-base-content/20 bg-base-200 px-3 py-2 text-xs text-base-content/85 select-none"
>
	<span
		class="inline-flex items-center gap-1.5 transition-opacity"
		class:opacity-30={!commandHistory.canUndo}
	>
		<kbd>{modKey}+Z</kbd>
		{m.keyboard_shortcut_undo()}
	</span>
	<span
		class="inline-flex items-center gap-1.5 transition-opacity"
		class:opacity-30={!commandHistory.canRedo}
	>
		<kbd>{modKey}+{shiftKey}+Z</kbd>
		{m.keyboard_shortcut_redo()}
	</span>
	<span class="inline-flex items-center gap-1.5">
		<kbd>1</kbd>–<kbd>4</kbd>
		{m.keyboard_shortcut_panels()}
	</span>
	{#if menuStore.currentPanel === 'equalizer'}
		<span class="inline-flex items-center gap-1.5">
			<kbd>{shiftKey}+Drag</kbd>
			{m.keyboard_shortcut_axis_lock()}
		</span>
		<span class="inline-flex items-center gap-1.5">
			<kbd>\</kbd>
			{m.keyboard_shortcut_eq_bypass()}
		</span>
		<span class="inline-flex items-center gap-1.5">
			<kbd>Del</kbd>
			{m.keyboard_shortcut_delete_band()}
		</span>
	{/if}
</div>
