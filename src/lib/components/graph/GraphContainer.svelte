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
		// Iterate entries to subscribe to all SvelteMap mutations,
		// including same-key value updates (visibility, channel, normalize, smooth, y-offset).
		// A bare reference `frStore.entries` only tracks size changes, not value mutations.
		for (const _ of frStore.entries) { /* reactive subscription */ }
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
		const sourceUUID = eqStore.sourcePhoneUUID;
		// Track source phone's FR data so PK node positions update with the curve
		const _sourceData = sourceUUID ? frStore.get(sourceUUID) : null;
		if (graphEngine.isInitialized && overlay) {
			overlay.render();
		}
	});

	$effect(() => {
		const _currentPanel = menuStore.currentPanel;
		const _sourceUUID = eqStore.sourcePhoneUUID;
		overlay?.setEqPanelActive(
			menuStore.currentPanel === 'equalizer' && eqStore.sourcePhoneUUID !== null
		);
	});
</script>

<svg bind:this={svgEl} class="w-full h-full" role="img" aria-label="Frequency response graph">
	<title>Frequency response graph</title>
</svg>
