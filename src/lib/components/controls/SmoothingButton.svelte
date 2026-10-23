<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import { graphStore } from '#lib/stores/graph-store.svelte.js';
	import Button from '../atoms/Button.svelte';

	// Var and Psy keep REW's own labels, so they read the same as in REW
	const options = ['1/48', '1/24', '1/12', '1/6', '1/3', 'Var', 'Psy'] as const;
	const titles: Partial<Record<(typeof options)[number], () => string>> = {
		Var: m.smoothing_variable_label,
		Psy: m.smoothing_psychoacoustic_label
	};
	let currentIndex = $state(0);
	const current = $derived(options[currentIndex]);
	const title = $derived(titles[current]?.() ?? m.smoothing_button_label());

	function handleClick() {
		currentIndex = (currentIndex + 1) % options.length;
		graphStore.smoothValue = options[currentIndex];
		dataProvider.reSmoothAll();
	}
</script>

<Button {title} onclick={handleClick} variant="outline" size="toolbar">
	{m.smoothing_button_label()}
	<span class="h-5 w-px bg-base-content/20"></span>
	<b>{current in titles ? current : `${current}oct`}</b>
</Button>
