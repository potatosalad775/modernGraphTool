<script lang="ts">
	import { appStore } from '$lib/stores/app-store.svelte.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { getLocale, setLocale } from '$lib/paraglide/runtime.js';
	import { BookOpen, Globe, Heart, Moon, Sun } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';

	type DescriptionItem = { TYPE: string; CONTENT: string };

	const languages = [
		{ value: 'en', label: 'English' },
		{ value: 'ko', label: '한국어' }
	];

	const enableI18n = $derived(!!getConfigValue('LANGUAGE.ENABLE_I18N'));
	const description = $derived(
		getConfigValue('DESCRIPTION') as DescriptionItem[] | undefined
	);

	function toggleTheme() {
		appStore.theme = appStore.theme === 'light' ? 'dark' : 'light';
		document.documentElement.classList.toggle('dark', appStore.theme === 'dark');
		localStorage.setItem('gt-theme', appStore.theme);
	}

	function handleLocaleChange(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		setLocale(select.value as 'en' | 'ko');
	}

	const hideDonate = $derived(!!getConfigValue('INTERFACE.HIDE_DEV_DONATE_BUTTON'));
	const prefBoundTarget = (getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined) ?? '';
</script>

<div class="flex h-full flex-col gap-4 overflow-y-auto p-4">
	<!-- Theme + Language row -->
	<div class="flex items-center gap-3">
		<!-- Theme toggle button -->
		<button
			onclick={toggleTheme}
			title={appStore.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			class="flex h-9 w-9 items-center justify-center rounded-md border border-base-content/20  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
		>
			{#if appStore.theme === 'dark'}
				<!-- Moon icon -->
				<Moon class="h-4 w-4" aria-hidden="true" />
			{:else}
				<!-- Sun icon -->
				<Sun class="h-4 w-4" aria-hidden="true" />
			{/if}
		</button>

		<!-- Language selector (conditional) -->
		{#if enableI18n}
			<span class="h-5 w-px bg-base-content/20"></span>
			<!-- Globe icon -->
			<Globe class="h-4 w-4 " aria-hidden="true" />
			<select
				value={getLocale()}
				onchange={handleLocaleChange}
				class="h-9 flex-1 rounded-md border border-base-content/20 bg-base-200 px-2 text-sm  focus:outline-none focus:ring-1 focus:ring-accent"
			>
				{#each languages as lang (lang.value)}
					<option value={lang.value}>{lang.label}</option>
				{/each}
			</select>
		{/if}
	</div>

	<!-- Description (conditional) -->
	{#if description && description.length > 0}
		<div class="flex flex-col gap-2 text-sm ">
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
		<p class="text-sm text-base-content/70">
			{m.pref_bound_description_label()}: {prefBoundTarget}
		</p>
	{/if}

	<!-- Spacer to push info to bottom -->
	<div class="flex-1"></div>

	<!-- App info section -->
	<div class="flex flex-col items-center gap-1 text-center">
		<div class="flex items-baseline gap-2">
			<h2 class="text-base font-bold text-base-content">modernGraphTool v2</h2>
			<span class="text-xs text-base-content/60">beta</span>
		</div>
		<p class="text-xs text-base-content/60">Open-source project under the MIT license</p>
		<div class="flex gap-2 pt-0.5">
			<!-- GitHub button -->
			<a
				href="https://github.com/potatosalad775/modernGraphTool"
				target="_blank"
				rel="noopener noreferrer"
				title="GitHub"
				class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:"
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
				class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:"
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
					class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:"
				>
					<Heart class="h-4 w-4" aria-hidden="true" />
				</a>
			{/if}
		</div>
	</div>
</div>
