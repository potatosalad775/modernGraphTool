<script lang="ts">
	import type { PhoneState } from '../../../../utils/phoneBookConverter';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	$effect(() => {
		phone.detailed ??= { name: '', file: '' };
	});
</script>

{#if phone.detailed}
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-name">Display Name</label>
		<input
			id="{id}-name"
			type="text"
			class="ceInput"
			bind:value={phone.detailed.name}
			placeholder="e.g. Model D1"
		/>
	</div>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-file">
			File Base Name
			<span class="ceLabelHint">(without L/R and .txt)</span>
		</label>
		<input
			id="{id}-file"
			type="text"
			class="ceInput"
			bind:value={phone.detailed.file}
			placeholder="e.g. ModelD1_Data"
		/>
	</div>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-suffix">
			Suffix
			<span class="ceLabelHint">(optional, appended to name)</span>
		</label>
		<input
			id="{id}-suffix"
			type="text"
			class="ceInput"
			bind:value={phone.detailed.suffix}
			placeholder="e.g. &quot;Rev.2&quot; or &quot;(Foam Tip)&quot;"
		/>
	</div>
{/if}
