<script lang="ts">
	// Styles come from `src/styles/tools.css`, imported by the .astro page — one
	// sheet for all three tools, so the shared form controls are shared by
	// definition rather than by importing the config editor's stylesheet here.
	import { phoneBook } from './phone-book-store.svelte';
	import ImportPanel from './ImportPanel.svelte';
	import ExportBar from './ExportBar.svelte';
	import BrandList from './BrandList.svelte';
	import BrandEditor from './BrandEditor.svelte';

	let selectedBrandId = $state<string | null>(null);

	/*
	 * Keep the selection valid: default to the first brand, and recover when the
	 * selected one is deleted or the whole phone book is replaced by an import.
	 * `$derived` rather than the React version's `useEffect` + `setState`, so
	 * there is no render where the selection points at a brand that is gone.
	 */
	let selectedBrand = $derived(
		phoneBook.book.find((b) => b.id === selectedBrandId) ?? phoneBook.book[0] ?? null
	);
</script>

<div class="toolContainer">
	<ImportPanel />
	<div class="pbLayout">
		<BrandList
			selectedBrandId={selectedBrand?.id ?? null}
			onSelect={(id) => (selectedBrandId = id)}
		/>
		<!--
			Keyed on the brand so each brand gets its own expand/collapse state
			without an effect to reset it.
		-->
		{#key selectedBrand?.id}
			<BrandEditor brand={selectedBrand} onBrandDeleted={() => (selectedBrandId = null)} />
		{/key}
	</div>
	<ExportBar />
</div>
