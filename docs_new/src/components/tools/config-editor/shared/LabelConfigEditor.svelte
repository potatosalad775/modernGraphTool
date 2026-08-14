<script lang="ts">
	import type { LabelFormState } from '../../../../utils/configDefaults';

	interface Props {
		label: string;
		value: LabelFormState;
	}

	let { label, value = $bindable() }: Props = $props();

	const LOCATIONS = ['BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TOP_LEFT', 'TOP_RIGHT'];
	const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
	const DIRECTIONS = ['LEFT', 'RIGHT', 'UP', 'DOWN'] as const;

	const id = $props.id();
</script>

<div class="ceSubSection">
	<div class="ceSubSectionTitle">{label}</div>

	<div class="ceCardGrid">
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-location">Location</label>
			<select id="{id}-location" class="ceSelect" bind:value={value.LOCATION}>
				{#each LOCATIONS as loc (loc)}
					<option value={loc}>{loc.replace(/_/g, ' ')}</option>
				{/each}
			</select>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-size">Text Size</label>
			<input
				id="{id}-size"
				type="text"
				class="ceInput ceInputSmall"
				bind:value={value.TEXT_SIZE}
				placeholder="14px"
			/>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-weight">Font Weight</label>
			<select id="{id}-weight" class="ceSelect" bind:value={value.TEXT_WEIGHT}>
				{#each WEIGHTS as w (w)}
					<option value={w}>{w}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Position Offsets</span>
		<div class="ceCardGrid">
			{#each DIRECTIONS as dir (dir)}
				<div style="display: flex; align-items: center; gap: 0.375rem;">
					<label style="font-size: 0.75rem; min-width: 40px;" for="{id}-pos-{dir}">{dir}</label>
					<input
						id="{id}-pos-{dir}"
						type="text"
						class="ceInput ceInputSmall"
						bind:value={value.POSITION[dir]}
						placeholder="0"
					/>
				</div>
			{/each}
		</div>
	</div>
</div>
