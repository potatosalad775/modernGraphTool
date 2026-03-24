<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { GraphEqOverlay } from '$lib/graph/GraphEqOverlay.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { appStore } from '$lib/stores/app-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { menuStore } from '$lib/stores/menu-store.svelte.js';

	let svgEl = $state<SVGSVGElement | undefined>(undefined);
	let overlay = $state<GraphEqOverlay | null>(null);

	onMount(() => {
		if (svgEl) {
			graphEngine.init(svgEl, appStore.isMobile);
			overlay = new GraphEqOverlay(graphEngine);
		}
	});

	onDestroy(() => {
		overlay?.destroy();
		overlay = null;
	});

	$effect(() => {
		const _size = frStore.size;
		const _entries = frStore.entries;
		if (graphEngine.isInitialized) {
			graphEngine.refreshEveryFRCurves();
			graphEngine.updateLabels();
		}
	});

	$effect(() => {
		const _yScale = graphStore.yScale;
		if (graphEngine.isInitialized) {
			graphEngine.updateYScale(String(graphStore.yScale));
		}
	});

	$effect(() => {
		const _isMobile = appStore.isMobile;
		if (graphEngine.isInitialized && graphEngine.graphHandle) {
			graphEngine.graphHandle.setMobile(appStore.isMobile);
		}
	});

	$effect(() => {
		const _filters = eqStore.filters;
		const _isEnabled = eqStore.isEnabled;
		const _yScale = graphStore.yScale;
		if (graphEngine.isInitialized && overlay) {
			overlay.render();
		}
	});

	$effect(() => {
		const _currentPanel = menuStore.currentPanel;
		overlay?.setEqPanelActive(menuStore.currentPanel === 'equalizer');
	});
</script>

<svg bind:this={svgEl} class="w-full h-full"></svg>
