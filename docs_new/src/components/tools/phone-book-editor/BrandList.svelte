<script lang="ts">
	import { createEmptyBrand } from '../../../utils/phoneBookConverter';
	import { phoneBook, moveBy } from './phone-book-store.svelte';

	interface Props {
		selectedBrandId: string | null;
		onSelect: (brandId: string) => void;
	}

	let { selectedBrandId, onSelect }: Props = $props();

	let brands = $derived(phoneBook.book);

	function handleAdd() {
		const brand = createEmptyBrand();
		brands.push(brand);
		onSelect(brand.id);
	}
</script>

<!--
	Left-column brand picker. One-at-a-time selection; only the selected
	brand's workspace is rendered on the right, which scales to 100+ brands.
-->
<aside class="pbPicker">
	<div class="pbPickerHeader">
		<span class="pbPickerTitle">
			Brands <span class="pbPickerCount">({brands.length})</span>
		</span>
		<button
			type="button"
			class="pbIconBtn"
			onclick={() => phoneBook.sortBrandsAlpha()}
			title="Sort brands A → Z"
			disabled={brands.length < 2}
		>
			A↓
		</button>
	</div>

	{#if brands.length === 0}
		<div class="pbEmptyPicker">No brands yet.</div>
	{:else}
		<ul class="pbPickerList">
			{#each brands as brand, i (brand.id)}
				<li>
					<!--
						The row is a <div>, not a <button>: it carries the move-up/down
						buttons, and a button cannot contain another button. Selection is a
						real <button> on the label instead, so it stays keyboard-reachable
						without the React version's role/tabindex on a clickable parent.
					-->
					<div class="pbBrandButton" class:pbBrandButtonSelected={brand.id === selectedBrandId}>
						<button
							type="button"
							class="pbBrandButtonSelect"
							onclick={() => onSelect(brand.id)}
							aria-current={brand.id === selectedBrandId}
						>
							<span class="pbBrandButtonLabel">
								{[brand.name || '(unnamed)', brand.suffix].filter(Boolean).join(' ')}
							</span>
							<span class="pbBrandButtonCount">{brand.phones.length}</span>
						</button>
						<span class="pbBrandButtonActions">
							<button
								type="button"
								class="pbIconBtnMini"
								onclick={() => moveBy(brands, brand, 'up')}
								disabled={i === 0}
								title="Move up"
							>
								↑
							</button>
							<button
								type="button"
								class="pbIconBtnMini"
								onclick={() => moveBy(brands, brand, 'down')}
								disabled={i === brands.length - 1}
								title="Move down"
							>
								↓
							</button>
						</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<button type="button" class="pbBrandAddBtn" onclick={handleAdd}>+ Add brand</button>
</aside>
