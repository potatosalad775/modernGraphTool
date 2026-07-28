<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import { Accordion, type WithChildren } from 'bits-ui';
	import { fade } from 'svelte/transition';

	let {
		duration = 200,
		title,
		children,
		...restProps
	}: WithChildren<Accordion.ItemProps> & {
		duration?: number;
		title: string;
	} = $props();
</script>

<Accordion.Item {...restProps}>
	<Accordion.Header>
		<Accordion.Trigger
			class="flex w-full flex-1 cursor-pointer items-center gap-2 rounded-md p-2 text-sm font-medium text-base-content/70 transition-all select-none hover:bg-base-content/10 [&[data-state=open]>svg]:rotate-180"
		>
			<ChevronDown class="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
			{title}
		</Accordion.Trigger>
	</Accordion.Header>
	<Accordion.Content>
		{#snippet child({ props, open })}
			{#if open}
				<div {...props} transition:fade={{ duration }}>
					{@render children?.()}
				</div>
			{/if}
		{/snippet}
	</Accordion.Content>
</Accordion.Item>
