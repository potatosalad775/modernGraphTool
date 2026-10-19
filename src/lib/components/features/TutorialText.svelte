<script lang="ts">
	import type { StepText } from './tutorial-text.js';

	let { text }: { text: ReturnType<StepText> } = $props();

	const parts = $derived(typeof text === 'string' ? [text] : text);
</script>

<!--
	An icon is drawn as a chip shaped like the real outline button, so the text shows
	which control it means. Its negative margin keeps it out of the line height, so a
	line holding one isn't taller than the rest. The two spans touch: whitespace between
	them would land in the sentence a screen reader hears.
-->
{#each parts as part, i (i)}
	{#if typeof part === 'string'}
		{part}
	{:else}
		<span
			class="-my-1 inline-flex size-4.5 items-center justify-center rounded-md align-middle text-base-content/80 ring ring-base-content/20"
		>
			<part.icon class="size-3" aria-hidden="true" />
		</span><span class="sr-only">
			{part.label()}
		</span>
	{/if}
{/each}
