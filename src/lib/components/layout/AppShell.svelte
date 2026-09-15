<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { settingsStore } from '$lib/stores/settings-store.svelte';
	import { getConfigValue } from '$lib/utils/config';
	import { claimInitialLoad } from '$lib/services/initial-load';
	import { dataProvider } from '$lib/services/data-provider.svelte';
	import { commandHistory } from '$lib/services/command-history.svelte';
	import { eqCommands } from '$lib/services/eq-commands';
	import { graphStore } from '$lib/stores/graph-store.svelte';
	import { frStore } from '$lib/stores/fr-store.svelte';
	import { eqStore } from '$lib/stores/eq-store.svelte';
	import { preferenceBoundStore } from '$lib/stores/preference-bound-store.svelte';
	import { urlProvider } from '$lib/utils/url-provider';
	import TopNavBar from './TopNavBar.svelte';
	import DragDivider from './DragDivider.svelte';
	import MenuCarousel from './MenuCarousel.svelte';
	import GraphContainer from '$lib/components/graph/GraphContainer.svelte';
	import GraphToolbar from '$lib/components/controls/GraphToolbar.svelte';
	import { menuStore } from '$lib/stores/menu-store.svelte';
	import DevicePanel from '$lib/components/panels/DevicePanel.svelte';
	import GraphPanel from '$lib/components/panels/GraphPanel.svelte';
	import EqualizerPanel from '$lib/components/panels/EqualizerPanel.svelte';
	import MiscPanel from '$lib/components/panels/MiscPanel.svelte';
	import SponsorBanner from '$lib/components/features/SponsorBanner.svelte';
	import TutorialModal from '$lib/components/features/TutorialModal.svelte';
	import { Toaster, toast } from 'svelte-sonner';
	import FrequencyTutorial from '../features/FrequencyTutorial.svelte';
	import KeyboardShortcutBar from '$lib/components/controls/KeyboardShortcutBar.svelte';
	import { checkVersionUpdate } from '$lib/utils/version-update';
	import * as m from '$lib/paraglide/messages';

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

		// Read PREFERENCE_BOUND config — the initial-visibility default has to be
		// applied here, not in the toolbar button, which is unmounted on mobile
		// until the graph-controls accordion is expanded.
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
		dataProvider.installEqCurveSync();

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
		// has no root component yet, so `replaceState` throws.
		claimInitialLoad().then(() => {
			appStore.isReady = true;
		});

		return () => window.removeEventListener('resize', updateMobile);
	});

	// The restore value lives on `eqStore` rather than here so that an action taken
	// mid-hold — an import, an AutoEQ run — can redirect it via
	// `eqCommands.ensureEnabled()` instead of being silently undone on keyup.

	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const inEditable =
			target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

		const mod = e.metaKey || e.ctrlKey;

		// `\` (backslash) — press-and-hold to flip the EQ state momentarily for A/B
		// comparison. Bidirectional: it bypasses a live EQ and auditions a disabled
		// one, so the comparison can be started from either side. Ignored inside text
		// inputs, and when there is no EQ source phone to compare against.
		if (!inEditable && !mod && !e.altKey && e.key === '\\') {
			if (e.repeat) {
				e.preventDefault();
				return;
			}
			if (eqStore.momentaryRestore !== null) return;
			if (!eqStore.sourcePhoneUUID) return;
			e.preventDefault();
			const wasEnabled = eqStore.isEnabled;
			eqStore.momentaryRestore = wasEnabled;
			eqStore.isEnabled = !wasEnabled;
			eqStore.momentaryOverride = wasEnabled ? 'bypass' : 'audition';
			return;
		}

		if (inEditable) return;

		if (mod && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			// Flush any pending EQ-edit burst so undo doesn't land between
			// a coalescer's capture and its deferred commit.
			eqCommands.flushAll();
			commandHistory.undo(frStore);
			// Add/Remove change the phone count that channel display depends on —
			// re-sync since that derived display state isn't itself command-tracked.
			dataProvider.syncPhoneChannels();
			return;
		}

		if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
			e.preventDefault();
			eqCommands.flushAll();
			commandHistory.redo(frStore);
			dataProvider.syncPhoneChannels();
			return;
		}

		if (!mod && !e.altKey && !e.shiftKey) {
			const panels = ['device', 'graph', 'equalizer', 'misc'] as const;
			const num = parseInt(e.key);
			if (num >= 1 && num <= 4) {
				e.preventDefault();
				menuStore.setPanel(panels[num - 1]);
			}
		}
	}

	function releaseMomentaryBypass() {
		if (eqStore.momentaryRestore === null) return;
		eqStore.isEnabled = eqStore.momentaryRestore;
		eqStore.momentaryOverride = null;
		eqStore.momentaryRestore = null;
	}

	function handleKeyup(e: KeyboardEvent) {
		// Restore EQ regardless of focus target — the keyup may land in an input
		// if the user tabbed during the hold.
		if (e.key === '\\') releaseMomentaryBypass();
	}

	// Losing window focus mid-hold (alt-tab, devtools) swallows the keyup, which
	// would otherwise leave EQ bypassed indefinitely — restore on blur too.
	function handleWindowBlur() {
		releaseMomentaryBypass();
	}

	// Auto-update URL when store data changes (phones added/removed, graph state, etc.)
	$effect(() => {
		if (!appStore.isReady) return;
		// Subscribe to reactive dependencies
		for (const _ of frStore.entries) {
			/* track all FR data mutations */
		}
		const _yScale = graphStore.yScale;
		const _baseline = graphStore.baselineUUID;
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

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} onblur={handleWindowBlur} />

<div class="flex h-full flex-col">
	<TopNavBar />

	{#if appStore.isMobile}
		<main class="flex flex-1 flex-col overflow-hidden bg-base-100 text-base-content">
			<!-- Graph at top, no flex-grow so it stays pinned to top -->
			<section aria-label="Frequency response graph" class="flex flex-col overflow-hidden">
				<div class="min-h-0 overflow-hidden border-b border-base-content/15">
					<GraphContainer />
				</div>
				<div class="border-b border-base-content/15 bg-base-200">
					<FrequencyTutorial />
				</div>
			</section>
			<!-- Panel area fills remaining space -->
			<section
				aria-label="Controls"
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
				aria-label="Frequency response graph"
				class="flex flex-col overflow-hidden bg-base-100"
			>
				<div class="min-h-0 overflow-hidden border-b border-base-content/15">
					<GraphContainer />
				</div>
				<div class="border-b border-base-content/15 bg-base-200">
					<FrequencyTutorial />
				</div>
				<GraphToolbar />
				<KeyboardShortcutBar />
			</section>
		{/snippet}
		{#snippet controlsSection()}
			<section aria-label="Controls" class="flex min-w-85 flex-col overflow-hidden bg-base-100">
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

<SponsorBanner />
<TutorialModal />
