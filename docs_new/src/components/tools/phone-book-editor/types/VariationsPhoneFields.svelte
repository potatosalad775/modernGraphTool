<script lang="ts">
	import type { PhoneState } from '../../../../utils/phoneBookConverter';
	import RowsEditor from '../shared/RowsEditor.svelte';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	$effect(() => {
		phone.variations ??= { name: '', rows: [] };
	});
</script>

{#if phone.variations}
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-name">Base Display Name</label>
		<input
			id="{id}-name"
			type="text"
			class="ceInput"
			bind:value={phone.variations.name}
			placeholder="e.g. Model V1"
		/>
	</div>
	<div class="ceFieldGroup">
		<span class="ceLabel">
			Variants
			<span class="ceLabelHint">(each row becomes one entry in the selection list)</span>
		</span>
		<RowsEditor
			bind:rows={phone.variations.rows}
			columns={[
				{ key: 'file', label: 'File base name', placeholder: 'e.g. ModelV1_Foam' },
				{ key: 'suffix', label: 'Suffix (shown in UI)', placeholder: '(Foam Tip)' }
			]}
			createEmpty={() => ({ file: '', suffix: '' })}
			minRows={1}
			addLabel="+ Add variant"
		/>
	</div>
{/if}
