<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { createEmptyPhone, type BrandState } from '../../../utils/phoneBookConverter';
	import { phoneBook } from './phone-book-store.svelte';
	import PhoneEditor from './PhoneEditor.svelte';

	interface Props {
		brand: BrandState | null;
		/** Called after the selected brand is deleted so the parent can reselect. */
		onBrandDeleted: () => void;
	}

	let { brand, onBrandDeleted }: Props = $props();

	const id = $props.id();

	/*
	 * Which phones are open.
	 *
	 * The React version needed a `Set`, two refs and an effect that diffed phone
	 * ids across renders — one to detect a brand switch and clear the set, one to
	 * spot newly-added phones and auto-expand them. Neither is needed here:
	 * adding a phone is a local action, so it expands the one it just created,
	 * and the parent keys this component on the brand id, so switching brands
	 * gets a fresh set for free.
	 */
	const expandedPhoneIds = new SvelteSet<string>();

	function togglePhone(phoneId: string) {
		if (expandedPhoneIds.has(phoneId)) expandedPhoneIds.delete(phoneId);
		else expandedPhoneIds.add(phoneId);
	}

	function handleAddPhone() {
		if (!brand) return;
		const phone = createEmptyPhone('detailed');
		brand.phones.push(phone);
		expandedPhoneIds.add(phone.id);
	}

	function handleDeleteBrand() {
		if (!brand) return;
		const label = [brand.name || '(unnamed brand)', brand.suffix].filter(Boolean).join(' ');
		if (confirm(`Remove brand "${label}" and all its phones?`)) {
			const i = phoneBook.book.indexOf(brand);
			if (i !== -1) phoneBook.book.splice(i, 1);
			onBrandDeleted();
		}
	}
</script>

<!--
	Right-column workspace for the currently selected brand. Shows brand fields
	at the top and a list of collapsible phone accordions below.
-->
<section class="pbWorkspace">
	{#if !brand}
		<div class="pbWorkspaceEmpty">
			Select a brand from the list to edit its phones, or add a new brand.
		</div>
	{:else}
		<div class="pbWorkspaceHeader">
			<div class="pbBrandFields">
				<div>
					<label class="ceLabel" for="{id}-name">
						Brand Name
						<span class="ceLabelHint">(required)</span>
					</label>
					<input
						id="{id}-name"
						type="text"
						class="ceInput"
						bind:value={brand.name}
						placeholder="e.g. Sennheiser"
					/>
				</div>
				<div>
					<label class="ceLabel" for="{id}-suffix">
						Suffix
						<span class="ceLabelHint">(optional)</span>
					</label>
					<input
						id="{id}-suffix"
						type="text"
						class="ceInput"
						bind:value={brand.suffix}
						placeholder="e.g. &quot;Audio&quot;"
					/>
				</div>
				<div class="pbBrandHeaderActions">
					<button
						type="button"
						class="ceBtn ceBtnDanger"
						onclick={handleDeleteBrand}
						title="Delete this brand"
					>
						Delete brand
					</button>
				</div>
			</div>
		</div>

		<div class="pbWorkspaceToolbar">
			<span class="pbWorkspaceToolbarLabel">
				Phones <span class="pbPickerCount">({brand.phones.length})</span>
			</span>
			<div class="pbWorkspaceToolbarActions">
				<button
					type="button"
					class="ceBtn"
					onclick={() => phoneBook.sortPhonesAlpha(brand)}
					disabled={brand.phones.length < 2}
					title="Sort phones A → Z"
				>
					Sort A→Z
				</button>
				<button
					type="button"
					class="ceBtn"
					onclick={() => brand.phones.forEach((p) => expandedPhoneIds.add(p.id))}
					disabled={brand.phones.length === 0}
				>
					Expand all
				</button>
				<button
					type="button"
					class="ceBtn"
					onclick={() => expandedPhoneIds.clear()}
					disabled={expandedPhoneIds.size === 0}
				>
					Collapse all
				</button>
			</div>
		</div>

		{#if brand.phones.length === 0}
			<div class="pbEmptyList">No phones in this brand yet. Click "Add phone" to get started.</div>
		{:else}
			{#each brand.phones as phone, i (phone.id)}
				<PhoneEditor
					{brand}
					bind:phone={brand.phones[i]}
					index={i}
					count={brand.phones.length}
					isExpanded={expandedPhoneIds.has(phone.id)}
					onToggleExpand={() => togglePhone(phone.id)}
				/>
			{/each}
		{/if}

		<button type="button" class="ceArrayAddBtn" onclick={handleAddPhone}>+ Add phone</button>
	{/if}
</section>
