<script lang="ts" generics="T">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import type { I18nArrayFormState } from '../../../../utils/configDefaults';
	import { configEditor } from '../config-store.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

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

	let currentLang = $state('default');

	let languageList = $derived(configEditor.config.LANGUAGE.LANGUAGE_LIST);
	let langs = $derived(languageList.map(([code]) => code).filter((c) => c !== 'en'));

	/*
	 * The React version read `state.i18n[lang] ?? []` and handed the fallback to
	 * the renderer, so edits to a language that had no entry yet were written to
	 * a throwaway array and lost. Mutating in place fixes that, but the slot has
	 * to exist first — and it has to be created *here*, on the tab change, not
	 * while rendering. Doing it in the template is a `state_unsafe_mutation`
	 * error: Svelte forbids writing state from a derived or template expression.
	 */
	function selectLang(code: string) {
		if (code !== 'default') value.i18n[code] ??= [];
		currentLang = code;
	}
</script>

<div class="ceI18nWrapper">
	<Checkbox bind:checked={value.useI18n} label="Enable multilingual support" />

	{#if value.useI18n}
		<Tabs.Root class="ceTabsRoot" value={currentLang} onValueChange={selectLang}>
			<Tabs.List class="ceTabs">
				<Tabs.Trigger class="ceTab" value="default">Default (EN)</Tabs.Trigger>
				{#each langs as code (code)}
					<Tabs.Trigger class="ceTab" value={code}>
						{languageList.find(([c]) => c === code)?.[1] ?? code}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<Tabs.Content class="ceTabContent" value="default">
				{@render renderItems(value.items, 'default')}
			</Tabs.Content>
			{#each langs as code (code)}
				<Tabs.Content class="ceTabContent" value={code}>
					{@render renderItems(value.i18n[code] ?? [], code)}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{:else}
		{@render renderItems(value.items, 'default')}
	{/if}
</div>
