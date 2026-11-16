<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { Accordion, type WithChildren } from 'bits-ui';
	import { fade } from 'svelte/transition';
	import { followReveal } from '#lib/utils/scroll-anchor.js';

	let {
		duration = 200,
		revealOnOpen = false,
		level = 3,
		title,
		children,
		...restProps
	}: WithChildren<Accordion.ItemProps> & {
		duration?: number;
		/** Scroll the opened section into view, header kept on screen. */
		revealOnOpen?: boolean;
		/**
		 * Heading level of the section header (`aria-level`). bits-ui defaults to 3 too; it is set
		 * explicitly so the outline reads h1 site, h2 panel (AppShell), h3 section.
		 */
		level?: 1 | 2 | 3 | 4 | 5 | 6;
		title: string;
	} = $props();

	// Runs when the content mounts, i.e. on open, and follows content that
	// loads in after it.
	function reveal(node: HTMLElement) {
		return followReveal(node, node.closest('[data-accordion-item]') ?? node);
	}
</script>

<Accordion.Item {...restProps}>
	<Accordion.Header {level}>
		<Accordion.Trigger
			class="flex w-full flex-1 cursor-pointer items-center gap-2 rounded-md p-2 text-sm font-medium text-base-content/80 transition-all select-none hover:bg-base-content/10 [&[data-state=open]>svg]:rotate-180"
		>
			<ChevronDown class="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
			{title}
		</Accordion.Trigger>
	</Accordion.Header>
	<Accordion.Content>
		{#snippet child({ props, open })}
			{#if open}
				<div {...props} transition:fade={{ duration }} {@attach revealOnOpen && reveal}>
					{@render children?.()}
				</div>
			{/if}
		{/snippet}
	</Accordion.Content>
</Accordion.Item>
