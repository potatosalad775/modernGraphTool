<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { getConfigValue } from '$lib/utils/config';
	import MetadataParser from '$lib/utils/metadata-parser';
	import { analyticsService } from '$lib/services/analytics-service.svelte';
	import { dataProvider } from '$lib/services/data-provider.svelte';
	import { graphStore } from '$lib/stores/graph-store.svelte';
	//import { frStore } from '$lib/stores/fr-store.svelte';
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

	let mainEl = $state<HTMLElement | undefined>(undefined);
	let gridCols = $state('minmax(400px, 65%) 5px minmax(340px, 1fr)');

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
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
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

		// Resolve initial theme: localStorage > config > system
		const savedTheme = localStorage.getItem('gt-theme') as 'light' | 'dark' | null;
		const cfgTheme = (getConfigValue('INTERFACE.PREFERRED_DARK_MODE_THEME') as string) ?? 'system';
		let resolved: 'light' | 'dark';
		if (savedTheme === 'light' || savedTheme === 'dark') {
			resolved = savedTheme;
		} else if (cfgTheme === 'dark') {
			resolved = 'dark';
		} else if (cfgTheme === 'system') {
			resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		} else {
			resolved = 'light';
		}
		appStore.theme = resolved;

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

	// Auto-update URL when store data changes (phones added/removed, graph state, etc.)
	$effect(() => {
		if (!appStore.isReady) return;
		// Subscribe to reactive dependencies
		//for (const _ of frStore.entries) { /* track all FR data mutations */ }
		//const _yScale = graphStore.yScale;
		//const _baseline = graphStore.baselineUUID;
		urlProvider.autoUpdate();
	});
</script>

<div class="flex flex-col" style="height: 100dvh">
	<TopNavBar />

	{#if appStore.isMobile}
		<main class="flex flex-1 flex-col overflow-hidden bg-surface text-foreground">
			<!-- Graph at top, no flex-grow so it stays pinned to top -->
			<section aria-label="Frequency response graph" class="shrink-0 overflow-hidden">
				<GraphContainer />
			</section>
			<!-- Panel area fills remaining space -->
			<section aria-label="Controls" class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
				<div class="min-h-0 flex-1 overflow-hidden">
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
				<!-- Menu carousel at bottom -->
				<MenuCarousel />
			</section>
		</main>
	{:else}
		<main
			bind:this={mainEl}
			class="grid flex-1 overflow-hidden"
			style:grid-template-columns={gridCols}
		>
			<!-- Left column: graph + toolbar -->
			<section aria-label="Frequency response graph" class="flex flex-col overflow-hidden bg-surface">
				<div class="min-h-0 overflow-hidden border-b border-border">
					<GraphContainer />
				</div>
				<GraphToolbar />
			</section>
			<DragDivider {mainEl} ondrag={(cols) => (gridCols = cols)} />
			<!-- Right column: menu + panel -->
			<section aria-label="Controls" class="flex min-w-[340px] flex-col overflow-hidden bg-surface">
				<MenuCarousel />
				<div class="min-h-0 flex-1 overflow-hidden">
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
			</section>
		</main>
	{/if}
</div>

<SponsorBanner />
