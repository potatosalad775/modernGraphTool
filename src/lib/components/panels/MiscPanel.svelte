<script lang="ts">
	import { getConfigValue } from '$lib/utils/config.js';
	import { BookOpen, Globe, Heart, Moon, Sun } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { getLocale, setLocale } from '$lib/paraglide/runtime.js';
	import Button from '../atoms/Button.svelte';

	const appVersion = __APP_VERSION__;

	type DescriptionItem = { TYPE: string; CONTENT: string };

	const languages = [
		{ value: 'en', label: 'English' },
		{ value: 'ko', label: '한국어' }
	];

	const enableI18n = $derived(!!getConfigValue('LANGUAGE.ENABLE_I18N'));
	const description = $derived(getConfigValue('DESCRIPTION') as DescriptionItem[] | undefined);

	const hideDonate = $derived(!!getConfigValue('INTERFACE.HIDE_DEV_DONATE_BUTTON'));
	const prefBoundTarget =
		(getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined) ?? '';

	function handleLocaleChange(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		setLocale(select.value as 'en' | 'ko');
	}
</script>

<div class="flex h-full flex-col gap-4 overflow-y-auto">
	<!-- Theme + Language row -->
	<div class="flex items-center gap-2 border-b border-base-content/15 bg-base-200 px-3 py-2">
		<Button
			onclick={() => settingsStore.toggleTheme()}
			title={settingsStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			class="h-8 w-8"
			variant="outline"
			size="icon"
		>
			{#if settingsStore.theme === 'dark'}
				<Moon class="h-4 w-4" aria-hidden="true" />
			{:else}
				<Sun class="h-4 w-4" aria-hidden="true" />
			{/if}
		</Button>
		{#if enableI18n}
			<div class="flex flex-1 items-center gap-2">
				<div class="mx-1 h-8 w-px bg-base-content/20"></div>
				<Globe class="-ml-0.5 h-4 w-4 text-base-content/70" aria-hidden="true" />
				<select
					value={getLocale()}
					onchange={handleLocaleChange}
					class="h-8 flex-1 rounded-md border border-base-content/20 bg-base-100 px-2 text-xs hover:cursor-pointer hover:bg-base-content/10 focus:ring-1 focus:ring-accent focus:outline-none"
				>
					{#each languages as lang (lang.value)}
						<option value={lang.value}>{lang.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- Description (conditional) -->
	{#if description && description.length > 0}
		<div class="flex flex-col gap-2 px-4 text-sm">
			{#each description as item (item.CONTENT)}
				{#if item.TYPE.toUpperCase() === 'TEXT'}
					<p>{item.CONTENT}</p>
				{:else if item.TYPE.toUpperCase() === 'IMAGE'}
					<img src={item.CONTENT} alt="" class="max-w-full rounded" />
				{:else if item.TYPE.toUpperCase() === 'HTML'}
					<!-- operator-supplied config content — trusted by definition -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html item.CONTENT}
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Preference bound description (auto-generated) -->
	{#if prefBoundTarget}
		<p class="px-4 text-sm text-base-content/70">
			{m.pref_bound_description_label()}: {prefBoundTarget}
		</p>
	{/if}

	<!-- Spacer to push info to bottom -->
	<div class="flex-1"></div>

	<!-- App info section -->
	<div class="mb-3 flex flex-col items-center gap-1 text-center">
		<div class="flex items-baseline gap-2">
			<h2 class="text-base font-bold text-base-content">modernGraphTool v2</h2>
			<span class="text-xs text-base-content/60">beta</span>
		</div>
		<p class="-mt-1 text-xs text-base-content/60">v{appVersion}</p>
		<div class="flex gap-2 pt-0.5">
			<!-- GitHub button -->
			<a
				href="https://github.com/potatosalad775/modernGraphTool"
				target="_blank"
				rel="noopener noreferrer"
				title="GitHub"
				class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-4 w-4"
					aria-hidden="true"
				>
					<path
						d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
					/>
				</svg>
			</a>

			<!-- Docs button -->
			<a
				href="https://potatosalad775.github.io/modernGraphTool/docs"
				target="_blank"
				rel="noopener noreferrer"
				title="Documentation"
				class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300"
			>
				<BookOpen class="h-4 w-4" aria-hidden="true" />
			</a>

			<!-- Donate button (conditional) -->
			{#if !hideDonate}
				<a
					href="https://ko-fi.com/potatosalad775"
					target="_blank"
					rel="noopener noreferrer"
					title="Support on Ko-fi"
					class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300"
				>
					<Heart class="h-4 w-4" aria-hidden="true" />
				</a>
			{/if}
		</div>
	</div>
</div>
