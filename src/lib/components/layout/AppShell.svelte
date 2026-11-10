<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { appStore } from '#lib/stores/app-store.svelte.js';
	import { settingsStore } from '#lib/stores/settings-store.svelte.js';
	import { getConfigValue } from '#lib/utils/config.js';
	import { claimInitialLoad } from '#lib/services/initial-load.js';
	import { eqCurve } from '#lib/services/eq-curve.svelte.js';
	import { onKeydown, onKeyup, onBlur } from '#lib/services/keyboard-shortcuts.js';
	import { graphStore } from '#lib/stores/graph-store.svelte.js';
	import { baseline } from '#lib/graph/baseline.js';
	import { frStore } from '#lib/stores/fr-store.svelte.js';
	import { preferenceBoundStore } from '#lib/stores/preference-bound-store.svelte.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { eqHistoryStore } from '#lib/stores/eq-history-store.svelte.js';
	import { eqBookmarkStore } from '#lib/stores/eq-bookmark-store.svelte.js';
	import { eqConstraintsStore } from '#lib/stores/eq-constraints-store.svelte.js';
	import { hasSavedLinkSession, linkConfig } from '#lib/services/link-config.js';
	import { urlProvider } from '#lib/utils/url-provider.js';
	import TopNavBar from './TopNavBar.svelte';
	import DragDivider from './DragDivider.svelte';
	import MenuCarousel from './MenuCarousel.svelte';
	import GraphContainer from '#lib/components/graph/GraphContainer.svelte';
	import GraphToolbar from '#lib/components/controls/GraphToolbar.svelte';
	import { menuStore } from '#lib/stores/menu-store.svelte.js';
	import DevicePanel from '#lib/components/panels/DevicePanel.svelte';
	import GraphPanel from '#lib/components/panels/GraphPanel.svelte';
	import EqualizerPanel from '#lib/components/panels/EqualizerPanel.svelte';
	import MiscPanel from '#lib/components/panels/MiscPanel.svelte';
	import SponsorBanner from '#lib/components/features/SponsorBanner.svelte';
	import TutorialModal from '#lib/components/features/TutorialModal.svelte';
	import VolumeWarningDialog from '#lib/components/features/VolumeWarningDialog.svelte';
	import { volumeWarning } from '#lib/services/volume-warning.svelte.js';
	import EqChannelConflictDialog from '#lib/components/equalizer/EqChannelConflictDialog.svelte';
	import { eqChannelConflict } from '#lib/services/eq-channel-conflict.svelte.js';
	import { Toaster, toast } from 'svelte-sonner';
	import TooltipHost from '#lib/components/atoms/TooltipHost.svelte';
	import FrequencyTutorial from '../features/FrequencyTutorial.svelte';
	import KeyboardShortcutBar from '#lib/components/controls/KeyboardShortcutBar.svelte';
	import { checkVersionUpdate } from '#lib/utils/version-update.js';
	import * as m from '#lib/paraglide/messages.js';

	const CHANGELOG_URL = 'https://potatosalad775.github.io/modernGraphTool/docs/changelog/';

	let mainEl = $state<HTMLElement | undefined>(undefined);
	// Default: panel on the left (matches the legacy CrinGraph / vanilla modernGraphTool layout).
	// Operator must explicitly set INTERFACE.PANEL_POSITION = 'right' to flip it.
	const panelOnLeft = getConfigValue('INTERFACE.PANEL_POSITION') !== 'right';
	// When panel is on the left, it gets the 340px min and the graph takes the flexible 65%.
	let gridCols = $state(
		panelOnLeft
			? 'minmax(340px, 1fr) 5px minmax(400px, 65%)'
			: 'minmax(400px, 65%) 5px minmax(340px, 1fr)'
	);

	function disableIOSZoom() {
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
		if (!isIOS) return;
		const meta = document.querySelector('meta[name=viewport]');
		if (!meta) return;
		let content = meta.getAttribute('content') ?? '';
		if (/maximum-scale=[\d.]+/.test(content)) {
			content = content.replace(/maximum-scale=[\d.]+/, 'maximum-scale=1.0');
		} else {
			content = [content, 'maximum-scale=1.0'].join(', ');
		}
		meta.setAttribute('content', content);
	}

	onMount(() => {
		disableIOSZoom();

		// Hydrate user preferences (theme, AutoEQ options, EQ-normalization link, …)
		settingsStore.hydrate();

		// Read PREFERENCE_BOUND config — the initial-selection default has to be
		// applied here, not in the selector row, which unmounts with the target list
		// (collapsed accordion, panel switch).
		preferenceBoundStore.hydrate();

		// Notify the user when the app version has changed since their last visit.
		// Skipped on first visit (no stored version) and on same/downgraded versions.
		const update = checkVersionUpdate(__APP_VERSION__);
		if (update) {
			toast.message(m.version_update_toast_title({ version: update.current }), {
				duration: 10000,
				action: {
					label: m.version_update_toast_changelog(),
					onClick: () => window.open(CHANGELOG_URL, '_blank', 'noopener,noreferrer')
				}
			});
		}

		// Keep the on-graph EQ curve in step with eqStore for the lifetime of the
		// page. EqualizerPanel unmounts on every panel switch, but the `\` A/B key
		// below is global — so this can't live in the panel.
		eqCurve.installSync();
		// History & Compare: the session log, and the saved bookmarks A/B can pick.
		eqBookmarkStore.hydrate();
		eqHistoryStore.install();
		eqChannelConflict.install();
		eqConstraintsStore.install();

		// A reload in a linked tab rejoins the session; uniPEQ keeps its approval. Loaded only then,
		// so the link costs the boot nothing.
		if (linkConfig().enabled && hasSavedLinkSession()) {
			void import('#lib/services/link-service.svelte.js').then(({ linkService }) =>
				linkService.resume()
			);
		}

		// Mobile detection
		const updateMobile = () => {
			appStore.isMobile = window.innerWidth < 1000;
		};
		updateMobile();
		window.addEventListener('resize', updateMobile);

		// Config defaults, the phone book and the initial curves. Usually already in
		// flight from hooks.client.ts; starts here when it isn't (the boot tests).
		// `isReady` is set here, not in the run: the run can finish before mount, and
		// flipping it mid-mount fires the URL effect below while SvelteKit's router
		// has no root component yet, so the shallow `goto` fails.
		claimInitialLoad().then(() => {
			appStore.isReady = true;
		});

		return () => window.removeEventListener('resize', updateMobile);
	});

	// Auto-update URL when store data changes (phones added/removed, graph state, etc.)
	$effect(() => {
		if (!appStore.isReady) return;
		// Subscribe to reactive dependencies
		for (const _ of frStore.entries) {
			/* track all FR data mutations */
		}
		const _yScale = graphStore.yScale;
		// The effective baseline, so a mode change (not only a new item) rewrites the URL.
		const _baselineUUID = baseline.uuid;
		const _baselineMode = baseline.mode;
		urlProvider.autoUpdate();
	});

	// Persist AutoEQ options to the currently-selected storage whenever they change.
	$effect(() => {
		if (!appStore.isReady) return;
		const o = settingsStore.autoEqOptions;
		// Touch each field so the effect re-runs on any nested mutation.
		void [o.freqMin, o.freqMax, o.qMin, o.qMax, o.gainMin, o.gainMax, o.useShelfFilter];
		settingsStore.persistAutoEqOptions();
	});
</script>

<!-- Bound here, not in a panel: the shortcuts fire from any panel. See keyboard-shortcuts.ts. -->
<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} onblur={onBlur} />

<div class="flex h-full flex-col">
	<TopNavBar />

	{#if appStore.isMobile}
		<main class="flex flex-1 flex-col overflow-hidden bg-base-100 text-base-content">
			<!-- Graph at top, no flex-grow so it stays pinned to top -->
			<section aria-label={m.app_shell_graph_label()} class="flex flex-col overflow-hidden">
				<div class="min-h-0 overflow-hidden border-b border-base-content/15">
					<GraphContainer />
				</div>
				{#if settingsStore.frequencyTutorialVisible}
					<div class="border-b border-base-content/15 bg-base-200">
						<FrequencyTutorial />
					</div>
				{/if}
			</section>
			<!-- Panel area fills remaining space -->
			<section
				aria-label={m.app_shell_controls_label()}
				class="flex min-h-0 flex-1 flex-col overflow-hidden border-base-content/15"
			>
				<div class="relative min-h-0 flex-1 overflow-hidden">
					{#key menuStore.currentPanel}
						<div
							class="absolute inset-0 flex flex-col overflow-hidden"
							in:fly={{ x: menuStore.slideDirection * 60, duration: 200, delay: 50 }}
							out:fly={{ x: menuStore.slideDirection * -60, duration: 150 }}
						>
							{#if menuStore.currentPanel === 'device'}
								<DevicePanel />
							{:else if menuStore.currentPanel === 'graph'}
								<GraphPanel />
							{:else if menuStore.currentPanel === 'equalizer'}
								<EqualizerPanel />
							{:else}
								<MiscPanel />
							{/if}
						</div>
					{/key}
				</div>
				<!-- Menu carousel at bottom -->
				<MenuCarousel />
			</section>
		</main>
	{:else}
		{#snippet graphSection()}
			<section
				aria-label={m.app_shell_graph_label()}
				class="flex flex-col overflow-hidden bg-base-100"
			>
				<div class="min-h-0 overflow-hidden border-b border-base-content/15">
					<GraphContainer />
				</div>
				{#if settingsStore.frequencyTutorialVisible}
					<div class="border-b border-base-content/15 bg-base-200">
						<FrequencyTutorial />
					</div>
				{/if}
				<GraphToolbar />
				<KeyboardShortcutBar />
			</section>
		{/snippet}
		{#snippet controlsSection()}
			<section
				aria-label={m.app_shell_controls_label()}
				class="flex min-w-85 flex-col overflow-hidden bg-base-100"
			>
				<MenuCarousel />
				<div class="relative min-h-0 flex-1 overflow-hidden">
					{#key menuStore.currentPanel}
						<div
							class="absolute inset-0"
							in:fly={{ x: menuStore.slideDirection * 60, duration: 200, delay: 50 }}
							out:fly={{ x: menuStore.slideDirection * -60, duration: 150 }}
						>
							{#if menuStore.currentPanel === 'device'}
								<DevicePanel />
							{:else if menuStore.currentPanel === 'graph'}
								<GraphPanel />
							{:else if menuStore.currentPanel === 'equalizer'}
								<EqualizerPanel />
							{:else}
								<MiscPanel />
							{/if}
						</div>
					{/key}
				</div>
			</section>
		{/snippet}
		<main
			bind:this={mainEl}
			class="grid flex-1 overflow-hidden"
			style:grid-template-columns={gridCols}
		>
			{#if panelOnLeft}
				{@render controlsSection()}
				<DragDivider {mainEl} {panelOnLeft} ondrag={(cols) => (gridCols = cols)} />
				{@render graphSection()}
			{:else}
				{@render graphSection()}
				<DragDivider {mainEl} {panelOnLeft} ondrag={(cols) => (gridCols = cols)} />
				{@render controlsSection()}
			{/if}
		</main>
	{/if}
</div>

<Toaster position="top-center" richColors closeButton theme={settingsStore.theme} />
<TooltipHost />

<SponsorBanner />
<TutorialModal />

<!-- Before this page first changes what plays: a hardware EQ write, or the audio player. -->
<VolumeWarningDialog
	open={volumeWarning.open}
	onAnswer={(go, quiet) => volumeWarning.answer(go, quiet)}
/>

<!-- Left/right-only bands under a restriction: a device can connect with the Equalizer closed. -->
<EqChannelConflictDialog />

<!-- The uniPEQ link's questions, which can come while the Equalizer panel is closed. -->
{#if linkStore.choice || linkStore.status?.review || linkStore.status?.consent}
	{#await import('#lib/components/features/LinkDialogs.svelte') then { default: LinkDialogs }}
		<LinkDialogs />
	{/await}
{/if}
