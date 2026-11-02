<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { tooltipTether } from './tooltip-tether.js';

	let {
		text,
		hint,
		trigger
	}: {
		/** Short label. Empty or missing turns the tooltip off. */
		text: string | undefined;
		/** Optional second line — what a disabled control is waiting for, say. */
		hint?: string;
		/** Render the element; merge `props` into its own with `mergeTooltipProps`. */
		trigger: Snippet<[{ props: Record<string | symbol, unknown> }]>;
	} = $props();
</script>

<Tooltip.Trigger tether={tooltipTether} payload={{ text: text ?? '', hint }} disabled={!text}>
	{#snippet child({ props })}
		{@render trigger({ props })}
	{/snippet}
</Tooltip.Trigger>
