<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import { dialogCardClass, dialogOverlayClass } from './dialog-shell.js';

	/**
	 * A modal with a title, an optional description and body, and a row of action buttons.
	 * `onOpenChange` fires for user-driven changes only (Escape, a click outside), after `open` is
	 * updated; it does not fire when the parent assigns `open` itself.
	 */
	let {
		open = $bindable(false),
		onOpenChange,
		title,
		description,
		children,
		actions,
		dismissible = true,
		class: className = ''
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		title: string;
		description?: string;
		/** Body between the description and the actions. */
		children?: Snippet;
		/** The footer buttons. */
		actions: Snippet;
		/** False ignores Escape and a click outside, so only an action can close it. */
		dismissible?: boolean;
		class?: string;
	} = $props();

	// `class` is merged over the shell, so a caller's `max-h-*` wins over its viewport cap.
	const contentClasses = $derived(twMerge(dialogCardClass, 'gap-3', className));

	function handleOpenChange(value: boolean) {
		open = value;
		onOpenChange?.(value);
	}
</script>

<DialogPrimitive.Root {open} onOpenChange={handleOpenChange}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class={dialogOverlayClass} />
		<DialogPrimitive.Content
			interactOutsideBehavior={dismissible ? 'close' : 'ignore'}
			escapeKeydownBehavior={dismissible ? 'close' : 'ignore'}
			class={contentClasses}
		>
			<DialogPrimitive.Title class="text-lg font-semibold text-balance text-base-content">
				{title}
			</DialogPrimitive.Title>
			{#if description !== undefined}
				<DialogPrimitive.Description class="text-sm text-pretty text-base-content/80">
					{description}
				</DialogPrimitive.Description>
			{/if}
			{@render children?.()}
			<div class="flex flex-wrap justify-end gap-2">
				{@render actions()}
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
