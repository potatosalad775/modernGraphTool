<script lang="ts" module>
	export type SelectMenuItem = { value: string; label: string };
	export type SelectMenuGroup = { id: string; heading: string; items: SelectMenuItem[] };
</script>

<script lang="ts">
	import { Select } from 'bits-ui';
	import { Check, ChevronDown } from '@lucide/svelte';

	/**
	 * Single-choice picker with grouped options — the styled stand-in for `<select>`.
	 *
	 * bits-ui `Select` keeps what the native element gave for free: listbox
	 * semantics, arrow keys, typeahead and "n of m, selected". A `PopoverPanel`
	 * of buttons (`EqOptionButton`'s shape) has none of that, which is fine for a
	 * searchable catalog but not for a control that replaces a select.
	 *
	 * The trigger is named by `label` *and* the current choice, through
	 * `aria-labelledby` — an `aria-label` alone would replace the shown value as
	 * the accessible name, so a screen reader would never hear what is selected.
	 *
	 * Empty groups are skipped, so callers can pass every group unconditionally.
	 */
	let {
		value,
		groups,
		onValueChange,
		label,
		placeholder,
		disabled = false,
		class: className = ''
	}: {
		/** `''` shows the placeholder. */
		value: string;
		groups: readonly SelectMenuGroup[];
		onValueChange: (value: string) => void;
		/** Accessible name; not drawn. */
		label: string;
		placeholder: string;
		disabled?: boolean;
		class?: string;
	} = $props();

	const uid = $props.id();

	const visibleGroups = $derived(groups.filter((g) => g.items.length > 0));
	const items = $derived(visibleGroups.flatMap((g) => g.items));
	const selectedLabel = $derived(items.find((i) => i.value === value)?.label ?? '');
</script>

<Select.Root type="single" {value} {onValueChange} {items} {disabled}>
	<span id="{uid}-label" class="sr-only">{label}</span>
	<Select.Trigger
		aria-labelledby="{uid}-label {uid}-value"
		title={selectedLabel || placeholder}
		class="flex min-w-16 cursor-pointer items-center justify-between gap-1 rounded border border-base-content/20 bg-base-100 px-2 py-1 text-left text-sm transition-colors hover:bg-base-content/5 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 {className}"
	>
		<span id="{uid}-value" class="truncate {selectedLabel ? '' : 'text-base-content/60'}">
			{selectedLabel || placeholder}
		</span>
		<ChevronDown class="size-3.5 shrink-0 text-base-content/60" aria-hidden="true" />
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={4}
			class="z-50 max-h-[min(20rem,var(--bits-select-content-available-height))] max-w-[min(24rem,var(--bits-select-content-available-width))] min-w-(--bits-select-anchor-width) overflow-y-auto rounded-lg border border-base-content/15 bg-base-200 p-1 shadow-xl"
		>
			<Select.Viewport>
				{#each visibleGroups as group (group.id)}
					<Select.Group>
						<Select.GroupHeading
							class="px-2 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase"
						>
							{group.heading}
						</Select.GroupHeading>
						{#each group.items as item (item.value)}
							<Select.Item
								value={item.value}
								label={item.label}
								class="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm text-base-content outline-none data-highlighted:bg-base-300 data-selected:font-medium data-selected:text-accent"
							>
								{#snippet children({ selected })}
									<span class="truncate">{item.label}</span>
									{#if selected}
										<Check class="size-3.5 shrink-0" aria-hidden="true" />
									{/if}
								{/snippet}
							</Select.Item>
						{/each}
					</Select.Group>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
