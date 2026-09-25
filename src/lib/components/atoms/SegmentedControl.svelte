<script lang="ts" generics="T extends string">
	import { ToggleGroup } from 'bits-ui';

	/**
	 * One-of-N picker drawn as joined buttons — a setting, not a tab strip.
	 *
	 * Built on bits-ui's single `ToggleGroup` rather than `Tabs`: tabs announce
	 * "tab 1 of 2" and expect a tab panel to switch, while these pick a value and
	 * leave the surrounding content alone. The items come out as `role="radio"`
	 * with arrow-key roving focus.
	 *
	 * A single toggle group lets a second press on the selected item clear the
	 * value to `''`. A segmented control always holds one, so the setter drops
	 * the empty value and the getter keeps handing back the current one.
	 */
	let {
		value = $bindable(),
		options,
		onValueChange,
		disabled = false,
		label,
		class: className = ''
	}: {
		value: T;
		options: readonly { value: T; label: string; title?: string }[];
		onValueChange?: (value: T) => void;
		disabled?: boolean;
		/** Accessible name for the group; pair it with a visible label where one fits. */
		label: string;
		class?: string;
	} = $props();
</script>

<ToggleGroup.Root
	type="single"
	bind:value={
		() => value,
		(next) => {
			if (!next || next === value) return;
			value = next as T;
			onValueChange?.(next as T);
		}
	}
	{disabled}
	aria-label={label}
	class="flex rounded-md border border-base-content/20 {className}"
>
	{#each options as option (option.value)}
		<ToggleGroup.Item
			value={option.value}
			title={option.title}
			class="relative flex-1 border-base-content/20 bg-base-100 px-2 py-1 text-xs font-medium text-base-content/70 transition-colors not-first:border-l first:rounded-l-md last:rounded-r-md hover:bg-base-content/5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-content"
		>
			{option.label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
