<script lang="ts">
	import type { PhoneState } from '../../../../utils/phoneBookConverter';

	interface Props {
		phone: PhoneState;
	}

	let { phone = $bindable() }: Props = $props();

	const id = $props.id();

	$effect(() => {
		phone.prefix ??= { name: '', prefix: '', files: [] };
	});
</script>

{#if phone.prefix}
	{@const files = phone.prefix.files}
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-name">Base Display Name</label>
		<input
			id="{id}-name"
			type="text"
			class="ceInput"
			bind:value={phone.prefix.name}
			placeholder="e.g. Model P1"
		/>
	</div>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-prefix">
			Common File Prefix
			<span class="ceLabelHint">
				(the parser looks for <code>prefix + file[i] L.txt</code>)
			</span>
		</label>
		<input
			id="{id}-prefix"
			type="text"
			class="ceInput"
			bind:value={phone.prefix.prefix}
			placeholder="e.g. BrandP ModelP1"
		/>
	</div>
	<div class="ceFieldGroup">
		<span class="ceLabel">
			Distinguishing Parts
			<span class="ceLabelHint">(used both as UI suffix and to build the filename)</span>
		</span>
		<!--
			Inlined rather than reusing RowsEditor: `files` is a plain string[], and
			adapting it to RowsEditor's object rows would mean mapping in and out on
			every keystroke, which is exactly the round trip the port removes
			elsewhere. Same markup and classes, so it looks identical.
		-->
		<div>
			<div class="pbRowsTable">
				<div class="pbRowsHeader pbRowOneCol">
					<span>Part (e.g. "(Foam Tip)")</span>
					<span></span>
				</div>
				{#each files as _, i (i)}
					<div class="pbRow pbRowOneCol">
						<input
							type="text"
							class="ceInput"
							bind:value={files[i]}
							placeholder="(Foam Tip)"
							aria-label="Part {i + 1}"
						/>
						<button
							type="button"
							class="ceArrayRemoveBtn"
							onclick={() => files.splice(i, 1)}
							title="Remove row"
							disabled={files.length <= 1}
						>
							&times;
						</button>
					</div>
				{/each}
			</div>
			<button type="button" class="ceArrayAddBtn" onclick={() => files.push('')}>
				+ Add part
			</button>
		</div>
	</div>
{/if}
