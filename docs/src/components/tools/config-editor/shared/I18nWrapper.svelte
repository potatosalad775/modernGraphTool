<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { I18nArrayFormState } from '../../../../utils/configDefaults';
	import { configEditor } from '../config-store.svelte';

	interface Props {
		/**
		 * Named `value` rather than `state`: a local binding called `state` makes
		 * every `$state(...)` in this file ambiguous with a store subscription on
		 * it, which Svelte warns about.
		 */
		value: I18nArrayFormState<T>;
		/** Renders the item editor for one language's items, which it may mutate. */
		renderItems: Snippet<[T[], string]>;
	}

	let { value = $bindable(), renderItems }: Props = $props();

	let activeLang = $state<string | null>(null);
	const toggleId = $props.id();

	let languageList = $derived(configEditor.config.LANGUAGE.LANGUAGE_LIST);
	let langs = $derived(languageList.map(([code]) => code).filter((c) => c !== 'en'));
	let currentLang = $derived(activeLang ?? 'default');

	/*
	 * The React version read `state.i18n[lang] ?? []` and handed the fallback to
	 * the renderer, so edits to a language that had no entry yet were written to
	 * a throwaway array and lost. Mutating in place fixes that, but the slot has
	 * to exist first — and it has to be created *here*, on the tab click, not
	 * while rendering. Doing it in the template is a `state_unsafe_mutation`
	 * error: Svelte forbids writing state from a derived or template expression.
	 */
	function selectLang(code: string | null) {
		if (code !== null) value.i18n[code] ??= [];
		activeLang = code;
	}
</script>

<div>
	<div class="ceI18nToggle">
		<input type="checkbox" class="ceCheckbox" id={toggleId} bind:checked={value.useI18n} />
		<label for={toggleId} class="ceToggleLabel">Enable multilingual support</label>
	</div>

	{#if value.useI18n}
		<div class="ceI18nTabs">
			<button
				type="button"
				class="ceI18nTab"
				class:ceI18nTabActive={currentLang === 'default'}
				onclick={() => selectLang(null)}
			>
				Default (EN)
			</button>
			{#each langs as code (code)}
				<button
					type="button"
					class="ceI18nTab"
					class:ceI18nTabActive={currentLang === code}
					onclick={() => selectLang(code)}
				>
					{languageList.find(([c]) => c === code)?.[1] ?? code}
				</button>
			{/each}
		</div>
		{#if currentLang === 'default'}
			{@render renderItems(value.items, 'default')}
		{:else}
			{@render renderItems(value.i18n[currentLang] ?? [], currentLang)}
		{/if}
	{:else}
		{@render renderItems(value.items, 'default')}
	{/if}
</div>
