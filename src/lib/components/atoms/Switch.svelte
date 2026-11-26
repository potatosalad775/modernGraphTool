<script lang="ts">
	import { Switch, Label, useId, type WithoutChildrenOrChild } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Tooltip from './Tooltip.svelte';
	import { mergeTooltipProps } from './tooltip-tether.js';

	let {
		id = useId(),
		checked = $bindable(false),
		ref = $bindable(null),
		labelText,
		labelClass = '',
		children,
		size = 'md',
		variant = 'accent',
		title,
		blocked = false,
		onCheckedChange,
		...restProps
	}: WithoutChildrenOrChild<Switch.RootProps> & {
		labelText?: string | undefined;
		labelClass?: string;
		children?: Snippet;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'accent' | 'muted';
		/**
		 * Tooltip, and the accessible description when `labelText`, `aria-label` or
		 * `aria-labelledby` already names the switch. With none, it becomes the name instead.
		 */
		title?: string;
		/**
		 * Unusable for a moment (an operation under way): `aria-disabled`, looks disabled and
		 * ignores a press, but keeps focus, which `disabled` would drop to the page.
		 */
		blocked?: boolean;
	} = $props();

	const descriptionId = $props.id();
	const describes = $derived(
		!!title && !!(labelText || restProps['aria-label'] || restProps['aria-labelledby'])
	);

	const sizeClasses = {
		sm: 'h-5 w-9',
		md: 'h-6 w-11',
		lg: 'h-7 w-14'
	} as const;

	const thumbSizeClasses = {
		sm: 'size-3.5 data-[state=checked]:translate-x-4',
		md: 'size-[18px] data-[state=checked]:translate-x-5',
		lg: 'size-[22px] data-[state=checked]:translate-x-7'
	} as const;

	// The off track is base-content/60 and its thumb base-100: both the track against the surface
	// (base-100..300) and the thumb against the track clear 3:1 (WCAG 1.4.11) in light and dark,
	// with margin for a lighter dark `base-content`. Position, not colour, carries on/off.
	const variantRootClasses = {
		accent:
			'focus-visible:ring-accent focus-visible:ring-offset-base-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-base-content/60',
		muted:
			'focus-visible:ring-base-content focus-visible:ring-offset-base-100 data-[state=checked]:bg-base-content/80 data-[state=unchecked]:bg-base-content/60'
	} as const;

	const variantThumbClasses = {
		accent: 'data-[state=checked]:bg-primary-content data-[state=unchecked]:bg-base-100',
		muted: 'data-[state=checked]:bg-base-100 data-[state=unchecked]:bg-base-100'
	} as const;
</script>

<div class="flex items-center">
	<Tooltip text={title}>
		{#snippet trigger({ props })}
			<Switch.Root
				bind:checked={
					() => checked,
					(next) => {
						if (!blocked) checked = next;
					}
				}
				onCheckedChange={(next) => {
					if (!blocked) onCheckedChange?.(next);
				}}
				bind:ref
				{id}
				class="peer inline-flex shrink-0 cursor-pointer items-center rounded-full px-0.75 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[state=unchecked]:shadow-inner {sizeClasses[
					size
				]} {variantRootClasses[variant]} {restProps.class}"
				{...mergeTooltipProps(restProps, props)}
				aria-disabled={blocked || restProps['aria-disabled']}
				aria-label={labelText ? restProps['aria-label'] : (restProps['aria-label'] ?? title)}
				aria-describedby={describes ? descriptionId : restProps['aria-describedby']}
			>
				<Switch.Thumb
					class="pointer-events-none block shrink-0 rounded-full shadow-sm transition-transform data-[state=unchecked]:translate-x-0 {thumbSizeClasses[
						size
					]} {variantThumbClasses[variant]}"
				/>
			</Switch.Root>
		{/snippet}
	</Tooltip>
	{#if describes}<span id={descriptionId} hidden>{title}</span>{/if}
	{#if labelText}
		<Label.Root
			for={id}
			class="ml-2 text-sm font-medium {restProps.disabled === true && 'opacity-50'} {labelClass}"
		>
			{labelText}
		</Label.Root>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
