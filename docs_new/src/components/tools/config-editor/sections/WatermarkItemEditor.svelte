<script lang="ts">
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';
	import type { WatermarkFormState } from '../../../../utils/configDefaults';

	interface Props {
		item: WatermarkFormState;
		index: number;
		onRemove: () => void;
	}

	let { item = $bindable(), index, onRemove }: Props = $props();

	const LOCATIONS = ['BOTTOM_LEFT', 'BOTTOM_RIGHT', 'TOP_LEFT', 'TOP_RIGHT'];
	const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;
	const id = $props.id();

	/*
	 * `CONTENT` is a string for TEXT watermarks and a string[] for IMAGE ones,
	 * and the type toggle flips between them. The React version coerced to an
	 * array at the point of render and wrote the result back through `onChange`;
	 * mutating in place means the coercion has to happen to the stored value
	 * instead, or an edit to a watermark switched from TEXT would be applied to
	 * a temporary array and dropped.
	 */
	$effect(() => {
		if (item.TYPE === 'IMAGE' && !Array.isArray(item.CONTENT)) {
			item.CONTENT = item.CONTENT ? [item.CONTENT] : [];
		}
	});

	function setPosition(dir: (typeof DIRECTIONS)[number], value: string) {
		item.POSITION ??= { UP: '0', DOWN: '0', LEFT: '0', RIGHT: '0' };
		item.POSITION[dir] = value;
	}
</script>

<div class="ceCard">
	<div class="ceCardHeader">
		<span class="ceCardTitle">Watermark #{index + 1} ({item.TYPE})</span>
		<button type="button" class="ceBtn ceBtnSmall ceBtnDanger" onclick={onRemove}>Remove</button>
	</div>

	<div class="ceCardGrid">
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-type">Type</label>
			<select id="{id}-type" class="ceSelect" bind:value={item.TYPE}>
				<option value="TEXT">Text</option>
				<option value="IMAGE">Image</option>
			</select>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-location">Location</label>
			<select id="{id}-location" class="ceSelect" bind:value={item.LOCATION}>
				{#each LOCATIONS as loc (loc)}
					<option value={loc}>{loc.replace(/_/g, ' ')}</option>
				{/each}
			</select>
		</div>

		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-size">Size</label>
			<input
				id="{id}-size"
				type="text"
				class="ceInput ceInputSmall"
				bind:value={item.SIZE}
				placeholder="14px"
			/>
		</div>

		{#if item.OPACITY !== undefined}
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-opacity">Opacity</label>
				<input
					id="{id}-opacity"
					type="text"
					class="ceInput ceInputSmall"
					bind:value={item.OPACITY}
					placeholder="0.4"
				/>
			</div>
		{/if}
	</div>

	{#if item.TYPE === 'TEXT'}
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-content">Content</label>
			<input
				id="{id}-content"
				type="text"
				class="ceInput"
				value={typeof item.CONTENT === 'string' ? item.CONTENT : ''}
				oninput={(e) => (item.CONTENT = e.currentTarget.value)}
				placeholder="Watermark text"
			/>
		</div>
		<div class="ceCardGrid">
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-family">Font Family</label>
				<input
					id="{id}-family"
					type="text"
					class="ceInput ceInputSmall"
					bind:value={item.FONT_FAMILY}
					placeholder="sans-serif"
				/>
			</div>
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-weight">Font Weight</label>
				<input
					id="{id}-weight"
					type="text"
					class="ceInput ceInputSmall"
					bind:value={item.FONT_WEIGHT}
					placeholder="600"
				/>
			</div>
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-color">Color</label>
				<input
					id="{id}-color"
					type="text"
					class="ceInput ceInputSmall"
					bind:value={item.COLOR}
					placeholder="#000000"
				/>
			</div>
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-text-opacity">Opacity</label>
				<input
					id="{id}-text-opacity"
					type="text"
					class="ceInput ceInputSmall"
					bind:value={item.OPACITY}
					placeholder="0.4"
				/>
			</div>
		</div>
	{:else}
		<div class="ceFieldGroup">
			<span class="ceLabel">Image Paths</span>
			{#if Array.isArray(item.CONTENT)}
				<StringArrayEditor
					bind:items={item.CONTENT}
					placeholder="./assets/images/icon.png"
					addLabel="+ Add image"
				/>
			{/if}
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
							value={item.POSITION?.[dir] ?? '0'}
							oninput={(e) => setPosition(dir, e.currentTarget.value)}
							placeholder="0"
						/>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
