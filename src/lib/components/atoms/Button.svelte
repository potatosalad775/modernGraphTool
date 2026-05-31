<script lang="ts">
	import { Button, type WithChildren } from 'bits-ui';

	type Props = WithChildren<Button.RootProps> & {
		title: string;
		variant?: 'primary' | 'secondary' | 'muted' | 'destructive' | 'outline' | 'ghost' | 'link';
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
	};

	let { variant = 'primary', size = 'md', title, children, ...restProps }: Props = $props();

	const variantClasses = {
		primary: 'bg-primary text-primary-content hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-content hover:bg-secondary/80',
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
		icon: 'p-2'
	};
</script>

<Button.Root
	{...restProps}
	class="inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-base-100 {sizeClasses[
		size
	]} {variantClasses[variant]} {restProps.class}"
	{title}
	aria-label={restProps['aria-label'] || title}
>
	{@render children?.()}
</Button.Root>
