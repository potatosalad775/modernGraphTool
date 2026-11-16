<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	let {
		open = $bindable(false),
		onOpenChange,
		trigger,
		children,
		contentClass = '',
		label,
		sideOffset = 6,
		side = 'bottom',
		align = 'start',
		collisionPadding = 8,
		trapFocus = true
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		/**
		 * Merged over the defaults with `tailwind-merge`, so a plain `max-h-*` or `p-*` wins. The
		 * default caps the panel to the room left in the viewport and scrolls inside it (`html`
		 * is `overflow: hidden`, so anything taller would otherwise be clipped).
		 */
		contentClass?: string;
		/**
		 * Accessible name of the panel, translated. bits-ui gives the content no role (only the
		 * trigger says `aria-haspopup="dialog"`), and a name on a bare `div` is ignored, so a label
		 * also makes the panel a `role="dialog"`.
		 */
		label?: string;
		sideOffset?: number;
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		/** Distance kept between the panel and the viewport edge, in px. */
		collisionPadding?: number;
		trapFocus?: boolean;
	} = $props();

	const contentClasses = $derived(
		twMerge(
			'z-50 max-h-(--bits-popover-content-available-height) overflow-y-auto rounded-lg border border-base-content/15 bg-base-200 p-1.5 shadow-xl',
			contentClass
		)
	);

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
			{collisionPadding}
			role={label ? 'dialog' : undefined}
			aria-label={label}
			class={contentClasses}
		>
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
