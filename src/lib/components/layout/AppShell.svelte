<script lang="ts">
	import { onMount } from 'svelte';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { getConfigValue } from '$lib/utils/config';
	import MetadataParser from '$lib/utils/metadata-parser';
	import { analyticsService } from '$lib/services/analytics-service.svelte';
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

	let mainEl = $state<HTMLElement | undefined>(undefined);
	let gridCols = $state('minmax(400px, 65%) 5px minmax(340px, 1fr)');

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

		// Load phone/target metadata async — no cleanup needed
		MetadataParser.init().then(() => {
			appStore.isReady = true;
		});

		return () => window.removeEventListener('resize', updateMobile);
	});
</script>

<div class="flex flex-col" style="height: 100dvh">
	<TopNavBar />

	{#if appStore.isMobile}
		<main class="flex flex-1 flex-col overflow-hidden">
			<!-- Graph at top, no flex-grow so it stays pinned to top -->
			<section class="shrink-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950" style="height: 50dvh">
				<GraphContainer />
			</section>
			<!-- Panel area fills remaining space -->
			<section class="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-zinc-200 dark:border-zinc-700">
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
			<section class="flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
				<div class="min-h-0 flex-1 overflow-hidden">
					<GraphContainer />
				</div>
				<GraphToolbar />
			</section>
			<DragDivider {mainEl} ondrag={(cols) => (gridCols = cols)} />
			<!-- Right column: menu + panel -->
			<section class="flex min-w-[340px] flex-col overflow-hidden">
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
