<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CircleQuestionMark } from '@lucide/svelte';
	import Button from './Button.svelte';
	import PopoverPanel from './PopoverPanel.svelte';

	let {
		label,
		size = 'xs',
		side = 'bottom',
		align = 'start',
		icon,
		class: className = '',
		children
	}: {
		/** Accessible name of the trigger. Translated — build it with `m.info_popover_about()`. */
		label: string;
		/** `sm` matches a row of `icon-sm` buttons; `xs` sits beside a text label. */
		size?: 'xs' | 'sm';
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		/** Optional icon to use instead of the default question mark. */
		icon?: Snippet;
		/** Trigger classes, for spacing against the surrounding layout. */
		class?: string;
		children: Snippet;
	} = $props();
</script>

<PopoverPanel {side} {align}>
	{#snippet trigger({ props })}
		<Button
			{...props}
			title={label}
			variant="ghost"
			size={size === 'sm' ? 'icon-sm' : 'icon-xs'}
			activeOnOpen
			class="opacity-80 hover:opacity-100 {className}"
		>
			{#if icon}
				{@render icon()}
			{:else}
				<CircleQuestionMark class={size === 'sm' ? 'size-4' : 'size-3'} />
			{/if}
		</Button>
	{/snippet}
	<div class="flex max-w-xs flex-col gap-2 text-xs text-base-content">
		{@render children()}
	</div>
</PopoverPanel>
