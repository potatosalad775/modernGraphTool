<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { I18nArrayFormState } from '../../../../utils/configDefaults';
	import { configEditor } from '../config-store.svelte';

	interface Props {
		state: I18nArrayFormState<T>;
		/** Renders the item editor for one language's items, which it may mutate. */
		renderItems: Snippet<[T[], string]>;
	}

	let { state = $bindable(), renderItems }: Props = $props();

	let activeLang = $state<string | null>(null);
	const toggleId = $props.id();

	let languageList = $derived(configEditor.config.LANGUAGE.LANGUAGE_LIST);
	let langs = $derived(languageList.map(([code]) => code).filter((c) => c !== 'en'));
	let currentLang = $derived(activeLang ?? 'default');

	/*
	 * The React version read `state.i18n[lang] ?? []` and handed the fallback to
	 * the renderer, so edits to a language that had no entry yet were written to
	 * a throwaway array and lost. Mutating in place means the slot has to exist
	 * first, which also fixes that.
	 */
	function itemsFor(lang: string): T[] {
		state.i18n[lang] ??= [];
		return state.i18n[lang];
	}
</script>

<div>
	<div class="ceI18nToggle">
		<input type="checkbox" class="ceCheckbox" id={toggleId} bind:checked={state.useI18n} />
		<label for={toggleId} class="ceToggleLabel">Enable multilingual support</label>
	</div>

	{#if state.useI18n}
		<div class="ceI18nTabs">
			<button
				type="button"
				class="ceI18nTab"
				class:ceI18nTabActive={currentLang === 'default'}
				onclick={() => (activeLang = null)}
			>
				Default (EN)
			</button>
			{#each langs as code (code)}
				<button
					type="button"
					class="ceI18nTab"
					class:ceI18nTabActive={currentLang === code}
					onclick={() => (activeLang = code)}
				>
					{languageList.find(([c]) => c === code)?.[1] ?? code}
				</button>
			{/each}
		</div>
		{#if currentLang === 'default'}
			{@render renderItems(state.items, 'default')}
		{:else}
			{@render renderItems(itemsFor(currentLang), currentLang)}
		{/if}
	{:else}
		{@render renderItems(state.items, 'default')}
	{/if}
</div>
