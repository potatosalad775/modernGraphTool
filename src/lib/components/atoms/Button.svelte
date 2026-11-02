<script lang="ts">
	import { Button, type WithChildren } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Tooltip from './Tooltip.svelte';
	import { mergeTooltipProps } from './tooltip-tether.js';

	// Not `Omit<Button.RootProps, 'class'>` — `RootProps` is a discriminated union over
	// bits-ui's `child` snippet variants, and omitting across it produces a union
	// TypeScript refuses to represent.
	type Props = WithChildren<Button.RootProps> & {
		/** Rendered before `label`. */
		icon?: Snippet;
		/**
		 * A sentence the label can't carry — why the button is disabled, what it will do.
		 * Exposed as the accessible description, and shown as the tooltip.
		 */
		hint?: string;
		variant?:
			'primary' | 'secondary' | 'accent' | 'muted' | 'destructive' | 'outline' | 'ghost' | 'link';
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'toolbar' | 'icon' | 'icon-sm' | 'icon-xs';
		/**
		 * Highlight the button while the surface it opens is showing. bits-ui puts
		 * `data-state="open"` on a trigger, and the four popover triggers in the app
		 * all want the accent treatment rather than the muted default below.
		 */
		activeOnOpen?: boolean;
	} & (
			| {
					/**
					 * A text button. The visible label is the accessible name, so voice control
					 * can say what it reads (WCAG 2.5.3), and there is no tooltip unless a `hint`
					 * adds something the label doesn't.
					 */
					label: string;
					title?: never;
			  }
			| {
					/**
					 * An icon-only button, or one with custom `children`. The title is the
					 * accessible name and the tooltip, so keep it to a few words.
					 */
					title: string;
					label?: never;
			  }
		);

	let {
		variant = 'primary',
		size = 'md',
		activeOnOpen = false,
		label,
		title,
		icon,
		hint,
		children,
		...restProps
	}: Props = $props();

	const hintId = $props.id();

	const variantClasses = {
		primary: 'bg-primary text-primary-content hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-content hover:bg-secondary/80',
		accent: 'bg-accent text-accent-content hover:bg-accent/80',
		muted: 'bg-base-300 text-base-content hover:bg-base-300/60',
		destructive: 'bg-error text-error-content hover:bg-error/90',
		outline: 'ring ring-base-content/20 bg-inherit text-base-content hover:bg-base-content/10',
		ghost: 'text-base-content bg-inherit hover:bg-base-content/10',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses = {
		xs: 'px-1.5 py-0.5 text-[10px]',
		sm: 'px-2.5 py-1.5 text-xs',
		md: 'px-4 py-2 text-sm',
		lg: 'px-6 py-3 text-base',
		// Graph toolbar: icon + label pinned to one height so the row lines up.
		// Height comes from `--toolbar-height` in layout.css — NormalizerInput and
		// ShopLink sit in the same row and read the same variable.
		toolbar: 'h-(--toolbar-height) gap-1.5 px-2.5 text-xs',
		icon: 'p-2',
		'icon-sm': 'p-1.5',
		'icon-xs': 'p-1'
	};

	const base =
		'inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-base-100';

	const activeOnOpenClasses = 'data-[state=open]:bg-accent data-[state=open]:text-accent-content';

	/**
	 * Merged rather than concatenated. Two conflicting Tailwind utilities have equal
	 * CSS specificity, so appending the caller's class did nothing on its own — the
	 * winner was whichever utility Tailwind happened to emit later in the stylesheet,
	 * which is why every override used to need a `!` modifier. `twMerge` drops the
	 * losing class outright, so a plain `px-3` beats the size's `px-4`.
	 */
	let className = $derived(
		twMerge(
			base,
			sizeClasses[size],
			variantClasses[variant],
			activeOnOpen && activeOnOpenClasses,
			// bits-ui types `class` as Svelte's `ClassValue`, which admits objects and
			// arrays; every call site passes a plain string, and twMerge wants one.
			restProps.class as string | undefined
		)
	);
</script>

<!--
	No native `title`: the tooltip replaces it, and both would show at once. A hidden
	element still counts for `aria-describedby`, so the hint reaches screen readers
	without waiting for the tooltip to open.
-->
<Tooltip text={label === undefined ? title : hint} hint={label === undefined ? hint : undefined}>
	{#snippet trigger({ props })}
		<Button.Root
			{...mergeTooltipProps(restProps, props)}
			class={className}
			aria-label={restProps['aria-label'] || title}
			aria-describedby={hint ? hintId : restProps['aria-describedby']}
		>
			{@render icon?.()}
			{label}
			{@render children?.()}
			{#if hint}<span id={hintId} hidden>{hint}</span>{/if}
		</Button.Root>
	{/snippet}
</Tooltip>
