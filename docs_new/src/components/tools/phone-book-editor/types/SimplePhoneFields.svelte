<script lang="ts">
	import type { PhoneState } from '../../../../utils/phoneBookConverter';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	$effect(() => {
		phone.simple ??= { value: '' };
	});
</script>

{#if phone.simple}
	<div class="ceFieldGroup">
		<label class="ceLabel" for={id}>
			Device Name
			<span class="ceLabelHint">
				(the tool will load <code>{phone.simple.value || 'Name'} L.txt</code> and
				<code>{phone.simple.value || 'Name'} R.txt</code>)
			</span>
		</label>
		<input
			{id}
			type="text"
			class="ceInput"
			bind:value={phone.simple.value}
			placeholder="e.g. ModelX"
		/>
	</div>
{/if}
