<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { settingsStore } from '$lib/stores/settings-store.svelte';
	import { getConfigValue } from '$lib/utils/config';
	import MetadataParser from '$lib/utils/metadata-parser';
	import { analyticsService } from '$lib/services/analytics-service.svelte';
	import { dataProvider } from '$lib/services/data-provider.svelte';
	import { commandHistory } from '$lib/services/command-history.svelte';
	import { graphStore } from '$lib/stores/graph-store.svelte';
	import { frStore } from '$lib/stores/fr-store.svelte';
	import { urlProvider } from '$lib/utils/url-provider';
	import TopNavBar from './TopNavBar.svelte';
	import DragDivider from './DragDivider.svelte';
	import MenuCarousel from './MenuCarousel.svelte';
	import GraphContainer from '$lib/components/graph/GraphContainer.svelte';
	import GraphToolbar from '$lib/components/controls/GraphToolbar.svelte';
	import { menuStore, MENU_PANELS, type MenuPanel } from '$lib/stores/menu-store.svelte';
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

	/** Apply config defaults to stores before data loads */
	function applyConfigDefaults() {
		// INITIAL_PANEL: config uses "phone" but menuStore uses "device"
		const cfgPanel = getConfigValue('INITIAL_PANEL') as string | undefined;
		if (cfgPanel) {
			const mapped = cfgPanel === 'phone' ? 'device' : cfgPanel;
			if ((MENU_PANELS as readonly string[]).includes(mapped)) {
				menuStore.currentPanel = mapped as MenuPanel;
			}
		}

		// Normalization defaults
		const normType = getConfigValue('NORMALIZATION.TYPE') as 'Hz' | 'Avg' | undefined;
		if (normType === 'Hz' || normType === 'Avg') graphStore.normType = normType;
		const normHz = getConfigValue('NORMALIZATION.HZ_VALUE') as number | undefined;
		if (normHz != null) graphStore.normHzValue = normHz;

		// Default Y scale
		const yScale = getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as number | undefined;
		if (yScale != null) graphStore.yScale = yScale;
	}

	/** Load initial phones/targets from URL params or config defaults */
	async function loadInitialData(): Promise<void> {
		const urlPhones = urlProvider.phoneDataFromURL;

		if (urlPhones.length > 0) {
			// URL share param takes priority — load phones/targets from URL
			await Promise.all(
				urlPhones.map(async (name) => {
					const identifier = name.trim();
					try {
						const matchPhone = MetadataParser.searchFRInfoWithFullName(identifier);
						await dataProvider.addFRData('phone', matchPhone.identifier, {
							dispSuffix: matchPhone.dispSuffix
						});
					} catch {
						// Not a phone — try as target
						try {
							const matchTarget = MetadataParser.searchTargetInfoWithFullName(identifier);
							await dataProvider.addFRData('target', matchTarget.identifier);
						} catch {
							// Not found — skip silently
						}
					}
				})
			);
			// Apply URL state (yScale, baseline, yOffsets, EQ) after data is loaded
			urlProvider.applyStateFromURL();
		} else {
			// Fall back to config defaults
			const initialPhones = (getConfigValue('INITIAL_PHONES') || []) as string[];
			const initialTargets = (getConfigValue('INITIAL_TARGETS') || []) as string[];

			await Promise.all([
				...initialPhones.map(async (phone) => {
					try {
						const match = MetadataParser.searchFRInfoWithFullName(phone);
						await dataProvider.addFRData('phone', match.identifier, {
							dispSuffix: match.dispSuffix
						});
					} catch {
						// Phone not found in metadata — skip silently
					}
				}),
				...initialTargets.map(async (target) => {
					try {
						const targetName = target.includes(' Target') ? target : target + ' Target';
						const match = MetadataParser.searchTargetInfoWithFullName(targetName);
						await dataProvider.addFRData('target', match.identifier);
					} catch {
						// Target not found — skip silently
					}
				})
			]);
		}
	}

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

		// Mobile detection
		const updateMobile = () => {
			appStore.isMobile = window.innerWidth < 1000;
		};
		updateMobile();
		window.addEventListener('resize', updateMobile);

		// Initialize analytics (no-op if not on squig.link or not configured)
		analyticsService.init();

		// Parse URL params (synchronous — reads ?share= and ?state=)
		urlProvider.init();

		// Apply config defaults to stores
		applyConfigDefaults();

		// Load phone/target metadata, then load initial data from URL or config
		MetadataParser.init().then(async () => {
			await loadInitialData();
			appStore.isReady = true;
		});

		return () => window.removeEventListener('resize', updateMobile);
	});

	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
			return;

		const mod = e.metaKey || e.ctrlKey;

		if (mod && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			commandHistory.undo(frStore);
			// Add/Remove change the phone count that channel display depends on —
			// re-sync since that derived display state isn't itself command-tracked.
			dataProvider.syncPhoneChannels();
			return;
		}

		if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
			e.preventDefault();
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

<svelte:window onkeydown={handleKeydown} />

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
