<script module lang="ts">
	/** The release notes: the version toast's action and the About block's link share it. */
	export const CHANGELOG_URL = 'https://potatosalad775.github.io/modernGraphTool/docs/changelog/';
</script>

<script lang="ts">
	import { getConfigValue } from '#lib/utils/config.js';
	import { BookOpen, Globe, GraduationCap, Heart, Moon, ScrollText, Sun } from '@lucide/svelte';
	import { settingsStore } from '#lib/stores/settings-store.svelte.js';
	import { tutorialStore } from '#lib/stores/tutorial-store.svelte.js';
	import { analyticsService } from '#lib/services/analytics-service.svelte.js';
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';
	import Button from '../atoms/Button.svelte';
	import Switch from '../atoms/Switch.svelte';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';

	const appVersion = __APP_VERSION__;
	const uid = $props.id();
	const shortcutsLabelId = `${uid}-shortcuts`;
	const analyticsLabelId = `${uid}-analytics`;

	type DescriptionItem = { TYPE: string; CONTENT: string };

	// Languages are derived from the locales registered in project.inlang/settings.json.
	// Labels are each language's own endonym (e.g. ko → 한국어), resolved automatically.
	function localeLabel(locale: string): string {
		try {
			return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
		} catch {
			return locale;
		}
	}

	const languages = locales.map((value) => ({ value, label: localeLabel(value) }));

	const enableI18n = $derived(!!getConfigValue('LANGUAGE.ENABLE_I18N'));
	const description = $derived(getConfigValue('DESCRIPTION') as DescriptionItem[] | undefined);

	const hideDonate = $derived(!!getConfigValue('INTERFACE.HIDE_DEV_DONATE_BUTTON'));

	function handleLocaleChange(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		setLocale(select.value as Locale);
	}
</script>

<div class="flex h-full flex-col overflow-y-auto">
	<!-- Theme + Language row -->
	<div class="flex items-center gap-2 border-b border-base-content/15 bg-base-200 px-3 py-2">
		<Button
			onclick={() => settingsStore.toggleTheme()}
			title={settingsStore.theme === 'dark'
				? m.misc_panel_theme_light()
				: m.misc_panel_theme_dark()}
			hint={settingsStore.followsSystem
				? m.misc_panel_theme_hint_following()
				: settingsStore.toggleResumesSystem
					? m.misc_panel_theme_hint_resume()
					: undefined}
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
					aria-label={m.misc_panel_language_label()}
					onchange={handleLocaleChange}
					class="h-8 flex-1 rounded-md border border-base-content/20 bg-base-100 pl-2 text-xs hover:cursor-pointer hover:bg-base-content/10 focus:ring-1 focus:ring-accent focus:outline-hidden"
				>
					{#each languages as lang (lang.value)}
						<option value={lang.value}>{lang.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- Settings -->
	<Accordion type="multiple" class="pt-1">
		<!-- Single-key shortcuts (WCAG 2.1.4: a bare-key shortcut must be switchable off) -->
		<AccordionItem
			value="eq-settings"
			title={m.misc_panel_settings_accordion_title()}
			class="px-1"
			revealOnOpen
		>
			<div class="flex items-center justify-between p-2 pt-1">
				<div class="flex items-center">
					<span id={shortcutsLabelId} class="flex-1 text-xs font-medium text-base-content/80"
						>{m.misc_panel_single_key_shortcuts()}</span
					>
					<InfoPopover
						label={m.info_popover_about({ topic: m.misc_panel_single_key_shortcuts() })}
						class="ml-0.5"
					>
						<p>{m.misc_panel_single_key_shortcuts_key_hint()}</p>
						<p>{m.misc_panel_single_key_shortcuts_off_hint()}</p>
						<p>{m.misc_panel_single_key_shortcuts_mod_hint()}</p>
					</InfoPopover>
				</div>
				<Switch
					aria-labelledby={shortcutsLabelId}
					labelClass="text-xs font-normal"
					size="sm"
					bind:checked={
						() => settingsStore.singleKeyShortcuts, (on) => settingsStore.setSingleKeyShortcuts(on)
					}
				/>
			</div>
			<!-- Only where this deployment has analytics for this visitor (squig.link hosts) -->
			{#if analyticsService.available}
				<div class="flex items-center justify-between p-2 pt-1">
					<div class="flex items-center">
						<span id={analyticsLabelId} class="flex-1 text-xs font-medium text-base-content/80"
							>{m.misc_panel_analytics()}</span
						>
						<InfoPopover
							label={m.info_popover_about({ topic: m.misc_panel_analytics() })}
							class="ml-0.5"
						>
							<p>{m.misc_panel_analytics_what_hint()}</p>
							<p>{m.misc_panel_analytics_off_hint()}</p>
						</InfoPopover>
					</div>
					<Switch
						aria-labelledby={analyticsLabelId}
						labelClass="text-xs font-normal"
						size="sm"
						bind:checked={
							() => analyticsService.consent === 'granted', (on) => analyticsService.setConsent(on)
						}
					/>
				</div>
			{/if}
		</AccordionItem>
		<div class="mt-1 h-px w-full bg-base-content/20"></div>
	</Accordion>

	<!-- Description (conditional) -->
	{#if description && description.length > 0}
		<div class="flex flex-col gap-2 p-4 text-sm">
			<!-- By index: the list never reorders, and a repeated block may be deliberate -->
			{#each description as item, i (i)}
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

	<!-- Spacer to push info to bottom -->
	<div class="flex-1"></div>

	<!-- App info section -->
	<div class="mb-3 flex flex-col items-center gap-1 text-center">
		<div class="flex items-baseline gap-2">
			<h3 class="text-base font-bold text-base-content">modernGraphTool v2</h3>
		</div>
		<p class="-mt-1 text-xs text-base-content/80">v{appVersion}</p>
		<div class="flex gap-2 pt-0.5">
			<!-- GitHub button -->
			<Button
				href="https://github.com/potatosalad775/modernGraphTool"
				target="_blank"
				rel="noopener noreferrer"
				title="GitHub"
				variant="ghost"
				size="icon-sm"
				class="text-base-content/60 hover:bg-base-300"
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
			</Button>

			<!-- Docs button -->
			<Button
				href="https://potatosalad775.github.io/modernGraphTool/docs"
				target="_blank"
				rel="noopener noreferrer"
				title={m.misc_panel_docs()}
				variant="ghost"
				size="icon-sm"
				class="text-base-content/60 hover:bg-base-300"
			>
				<BookOpen class="h-4 w-4" aria-hidden="true" />
			</Button>

			<!-- Changelog button: the version toast's link is gone within seconds -->
			<Button
				href={CHANGELOG_URL}
				target="_blank"
				rel="noopener noreferrer"
				title={m.version_update_toast_changelog()}
				variant="ghost"
				size="icon-sm"
				class="text-base-content/60 hover:bg-base-300"
			>
				<ScrollText class="h-4 w-4" aria-hidden="true" />
			</Button>

			<!-- Tutorial button -->
			<Button
				title={m.tutorial_modal_replay_btn()}
				variant="ghost"
				size="icon-xs"
				class="text-base-content/60 hover:bg-base-300"
				onclick={() => tutorialStore.open('welcome')}
			>
				<GraduationCap class="size-4.5" aria-hidden="true" />
			</Button>

			<!-- Donate button (conditional) -->
			{#if !hideDonate}
				<Button
					href="https://ko-fi.com/potatosalad775"
					target="_blank"
					rel="noopener noreferrer"
					title={m.misc_panel_donate()}
					variant="ghost"
					size="icon-sm"
					class="text-base-content/60 hover:bg-base-300"
				>
					<Heart class="h-4 w-4" aria-hidden="true" />
				</Button>
			{/if}
		</div>
	</div>
</div>
