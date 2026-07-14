<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		trigger,
		children,
		contentClass = '',
		sideOffset = 6,
		side = 'bottom',
		align = 'start',
		trapFocus = true
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		trigger: Snippet<[{ props: Record<string, any> }]>;
		children: Snippet;
		contentClass?: string;
		sideOffset?: number;
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		trapFocus?: boolean;
	} = $props();

	function handleOpenChange(value: boolean) {
		open = value;
		onOpenChange?.(value);
	}
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
	<Popover.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			{sideOffset}
			{side}
			{align}
			{trapFocus}
			class="z-50 rounded-lg border border-base-content/15 bg-base-200 p-1.5 shadow-xl {contentClass}"
		>
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
