<script lang="ts">
	import { Checkbox } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		checked: boolean;
		/** Rendered as the clickable label beside the box. Omit for a bare box. */
		label?: string;
		/** Muted parenthetical after the label. */
		hint?: string;
		/**
		 * Richer label content than `label` + `hint` can express — a few of these
		 * carry `<code>` in the hint. Replaces both when given.
		 */
		children?: Snippet;
		/** Required when there is no label, so the control still announces itself. */
		ariaLabel?: string;
		disabled?: boolean;
		/**
		 * For the two "set of modes" groups, where the source of truth is an array
		 * and `checked` is derived from it rather than owned by the box. Everything
		 * else uses `bind:checked`.
		 */
		onCheckedChange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(),
		label,
		hint,
		children,
		ariaLabel,
		disabled = false,
		onCheckedChange
	}: Props = $props();

	const id = $props.id();
	let hasLabel = $derived(Boolean(label || children));
</script>

<!--
	bits-ui renders `.ceCheckbox` as a real <button role="checkbox">, so there is
	no hidden input to keep in sync and the checked state reaches CSS as
	`data-state`. The ported markup used a native input inside a <label>, which is
	why several call sites had to stop the click from reaching a clickable parent.
-->
<div class="ceToggleRow">
	<Checkbox.Root
		{id}
		class="ceCheckbox"
		bind:checked
		{disabled}
		{onCheckedChange}
		aria-label={hasLabel ? undefined : ariaLabel}
	>
		{#snippet children({ checked: isChecked, indeterminate })}
			{#if indeterminate}
				<Icon name="minus" class="ceCheckboxIcon" />
			{:else if isChecked}
				<Icon name="check" class="ceCheckboxIcon" />
			{/if}
		{/snippet}
	</Checkbox.Root>
	{#if hasLabel}
		<label for={id} class="ceToggleLabel">
			{#if children}
				{@render children()}
			{:else}
				{label}{#if hint}<span class="ceToggleHint">({hint})</span>{/if}
			{/if}
		</label>
	{/if}
</div>
