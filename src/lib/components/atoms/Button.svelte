<script lang="ts">
	import { Button, type WithChildren } from 'bits-ui';
	import { twMerge } from 'tailwind-merge';

	// Not `Omit<Button.RootProps, 'class'>` — `RootProps` is a discriminated union over
	// bits-ui's `child` snippet variants, and omitting across it produces a union
	// TypeScript refuses to represent.
	type Props = WithChildren<Button.RootProps> & {
		title: string;
		variant?:
			'primary' | 'secondary' | 'accent' | 'muted' | 'destructive' | 'outline' | 'ghost' | 'link';
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'toolbar' | 'icon' | 'icon-sm' | 'icon-xs';
		/**
		 * Highlight the button while the surface it opens is showing. bits-ui puts
		 * `data-state="open"` on a trigger, and the four popover triggers in the app
		 * all want the accent treatment rather than the muted default below.
		 */
		activeOnOpen?: boolean;
	};

	let {
		variant = 'primary',
		size = 'md',
		activeOnOpen = false,
		title,
		children,
		...restProps
	}: Props = $props();

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

<Button.Root {...restProps} class={className} {title} aria-label={restProps['aria-label'] || title}>
	{@render children?.()}
</Button.Root>
