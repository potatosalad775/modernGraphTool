<script lang="ts">
	interface Props {
		/**
		 * Bound directly and mutated in place. The React version took an
		 * `onChange` and rebuilt the array on every keystroke, which is what
		 * forced the parent to thread a setter down; `$state` proxies make the
		 * mutation itself reactive.
		 */
		items: string[];
		placeholder?: string;
		addLabel?: string;
	}

	let {
		items = $bindable(),
		placeholder = 'Enter value...',
		addLabel = '+ Add item'
	}: Props = $props();
</script>

<div>
	<div class="ceArrayList">
		<!--
			Keyed by index on purpose: the values are free text and duplicates are
			legal, so the index is the only stable identity available. Svelte keeps
			focus and caret position across edits either way, which is what the
			React version lost here.
		-->
		{#each items as _, i (i)}
			<div class="ceArrayItem">
				<input
					type="text"
					class="ceInput ceArrayInput"
					bind:value={items[i]}
					{placeholder}
					aria-label="{placeholder} {i + 1}"
				/>
				<button
					type="button"
					class="ceArrayRemoveBtn"
					onclick={() => items.splice(i, 1)}
					title="Remove"
				>
					&times;
				</button>
			</div>
		{/each}
	</div>
	<button type="button" class="ceArrayAddBtn" onclick={() => items.push('')}>
		{addLabel}
	</button>
</div>
