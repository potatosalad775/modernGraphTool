<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

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

	function handleOpenChange(value: boolean) {
		open = value;
		onOpenChange?.(value);
	}
</script>

<DialogPrimitive.Root {open} onOpenChange={handleOpenChange}>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<DialogPrimitive.Content
			interactOutsideBehavior={dismissible ? 'close' : 'ignore'}
			escapeKeydownBehavior={dismissible ? 'close' : 'ignore'}
			class="fixed top-1/2 left-1/2 z-50 flex w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-base-200 p-6 shadow-2xl {className}"
		>
			<DialogPrimitive.Title class="text-lg font-semibold text-base-content">
				{title}
			</DialogPrimitive.Title>
			{#if description !== undefined}
				<DialogPrimitive.Description class="text-sm text-base-content/70">
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
