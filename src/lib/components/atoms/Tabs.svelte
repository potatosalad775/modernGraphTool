<script lang="ts" generics="T extends string">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	/**
	 * A tab strip that switches the panel below it — the History / Bookmarks
	 * lists, say. For picking a value that leaves the content alone, use
	 * `SegmentedControl` instead: tabs announce "tab 1 of 2" and own a panel.
	 *
	 * Each item's panel comes from the one `panel` snippet, called with the
	 * item's value. Only the selected panel is rendered.
	 *
	 * `framed` draws one rounded border around the strip and the panel, so the
	 * tabs read as the header of the content they switch. Panel content should
	 * then drop its own outer border.
	 */
	let {
		value = $bindable(),
		items,
		label,
		panel,
		framed = false,
		expandTrigger = false,
		class: className = ''
	}: {
		value: T;
		items: readonly { value: T; label: string }[];
		/** Accessible name for the tab list. */
		label: string;
		panel: Snippet<[T]>;
		framed?: boolean;
		expandTrigger?: boolean;
		class?: string;
	} = $props();
</script>

<Tabs.Root
	bind:value={() => value, (next) => (value = next as T)}
	class="flex flex-col {framed
		? 'overflow-hidden rounded border border-base-content/20'
		: ''} {className}"
>
	<Tabs.List aria-label={label} class="flex border-b border-base-content/20">
		{#each items as item (item.value)}
			<Tabs.Trigger
				value={item.value}
				class="-mb-px cursor-pointer border-b-2 border-transparent px-3 py-1.5 text-xs font-medium text-base-content/60 transition-colors hover:text-base-content focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden focus-visible:ring-inset data-[state=active]:border-accent data-[state=active]:text-base-content {expandTrigger
					? 'flex-1'
					: ''}"
			>
				{item.label}
			</Tabs.Trigger>
		{/each}
	</Tabs.List>
	{#each items as item (item.value)}
		<Tabs.Content
			value={item.value}
			class="{framed
				? ''
				: 'mt-2 rounded'} focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden focus-visible:ring-inset"
		>
			<!-- bits-ui only hides an inactive panel; skip rendering it outright. -->
			{#if value === item.value}
				{@render panel(item.value)}
			{/if}
		</Tabs.Content>
	{/each}
</Tabs.Root>
