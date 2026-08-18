<script lang="ts" generics="Row extends Record<string, string>">
	import Icon from '../../shared/Icon.svelte';

	export interface RowsEditorColumn {
		key: string;
		label: string;
		placeholder?: string;
	}

	interface Props {
		rows: Row[];
		columns: RowsEditorColumn[];
		createEmpty: () => Row;
		minRows?: number;
		addLabel?: string;
	}

	let {
		rows = $bindable(),
		columns,
		createEmpty,
		minRows = 1,
		addLabel = 'Add row'
	}: Props = $props();

	let twoCol = $derived(columns.length === 2);

	function remove(index: number) {
		if (rows.length <= minRows) return;
		rows.splice(index, 1);
	}
</script>

<div class="ceArrayEditor">
	<div class="pbRowsTable">
		<div class="pbRowsHeader" class:pbRowTwoCol={twoCol} class:pbRowOneCol={!twoCol}>
			{#each columns as c (c.key)}
				<span>{c.label}</span>
			{/each}
			<span></span>
		</div>
		{#each rows as row, i (i)}
			<div class="pbRow" class:pbRowTwoCol={twoCol} class:pbRowOneCol={!twoCol}>
				{#each columns as c (c.key)}
					<input
						type="text"
						class="ceInput"
						value={row[c.key] ?? ''}
						placeholder={c.placeholder}
						aria-label="{c.label} {i + 1}"
						oninput={(e) => ((row as Record<string, string>)[c.key] = e.currentTarget.value)}
					/>
				{/each}
				<button
					type="button"
					class="ceArrayRemoveBtn"
					onclick={() => remove(i)}
					aria-label="Remove row {i + 1}"
					disabled={rows.length <= minRows}
				>
					<Icon name="close" />
				</button>
			</div>
		{/each}
	</div>
	<button type="button" class="ceArrayAddBtn" onclick={() => rows.push(createEmpty())}>
		<Icon name="plus" />
		{addLabel}
	</button>
</div>
