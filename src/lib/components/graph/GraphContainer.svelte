<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { GraphEqOverlay } from '$lib/graph/GraphEqOverlay.js';
	import { GraphSpectrumOverlay } from '$lib/graph/GraphSpectrumOverlay.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { appStore } from '$lib/stores/app-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { menuStore } from '$lib/stores/menu-store.svelte.js';
	import { audioSpectrumStore } from '$lib/stores/audio-spectrum-store.svelte.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import GraphWatermark from './GraphWatermark.svelte';
	import GraphXAxis from './GraphXAxis.svelte';

	let svgEl = $state<SVGSVGElement | undefined>(undefined);

	// ── FR Labels (Svelte-managed) ──────────────────────────────────────────
	const labelLocation = (getConfigValue('VISUALIZATION.LABEL.LOCATION') as string) || 'BOTTOM_LEFT';
	const labelFontSize = (getConfigValue('VISUALIZATION.LABEL.TEXT_SIZE') as string) || '20px';
	const labelFontWeight = (getConfigValue('VISUALIZATION.LABEL.TEXT_WEIGHT') as string) || '600';
	const labelLineHeight = parseInt((getConfigValue('VISUALIZATION.LABEL.TEXT_SIZE') as string) || '17') + 8;
	const labelOffsetRight = parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.RIGHT') as string) || '0');
	const labelOffsetLeft = parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.LEFT') as string) || '0');
	const labelOffsetDown = parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.DOWN') as string) || '0');
	const labelOffsetUp = parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.UP') as string) || '0');

	interface LabelEntry {
		uuid: string;
		channel: string;
		text: string;
		color: string;
		index: number;
	}

	const labelData = $derived.by(() => {
		if (!graphEngine.isInitialized) return { entries: [] as LabelEntry[], startX: 0, startY: 0, growUp: false, anchor: 'start', style: null as string | null };
		// Subscribe to frStore mutations
		for (const _ of frStore.entries) { /* reactive subscription */ }

		const pos = graphEngine.labelPosition[labelLocation];
		const startX = pos.x + labelOffsetRight - labelOffsetLeft;
		const startY = pos.y + labelOffsetDown - labelOffsetUp;

		const entries: LabelEntry[] = [];
		let counter = 0;

		Array.from(frStore.entries)
			.sort(([, a]) => (a.type === 'target' ? -1 : 1))
			.forEach(([, obj]) => {
				if (obj.hidden) return;
				const channels = [...obj.dispChannel];

				// HpTF items collapse to a single label line — the fill area is one
				// shared envelope across channels, so per-channel rows would just be
				// duplicate noise on the graph.
				if (obj.hptf) {
					const channelStr = channels.length === 2 && channels.includes('L') && channels.includes('R')
						? 'L+R'
						: channels.join('+');
					const desc = obj.hptfFillVisible && obj.hptf.description ? ` ${obj.hptf.description}` : '';
					const suffix = obj.dispSuffix ? ` ${obj.dispSuffix}` : '';
					const channelPart = channelStr ? ` (${channelStr})` : '';
					entries.push({
						uuid: obj.uuid,
						channel: 'hptf',
						text: `${obj.identifier}${suffix}${desc}${channelPart}`,
						color: obj.colors?.AVG || 'var(--color-base-content)',
						index: counter
					});
					counter++;
					return;
				}

				channels.forEach((channel) => {
					const text = obj.type !== 'target'
						? `${obj.identifier} ${obj.dispSuffix} (${channel})`
						: `${obj.identifier} ${obj.dispSuffix}`;
					entries.push({
						uuid: obj.uuid,
						channel,
						text,
						color: obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors?.AVG || 'var(--color-base-content)',
						index: counter
					});
					counter++;
				});
			});

		return { entries, startX, startY, growUp: pos.growUp, anchor: pos.anchor, style: pos.style ?? null };
	});

	const labelTransform = $derived(
		labelData.growUp
			? `translate(${labelData.startX}, ${labelData.startY - labelData.entries.length * labelLineHeight})`
			: `translate(${labelData.startX}, ${labelData.startY})`
	);

	// ── Baseline label (Svelte-managed) ─────────────────────────────────────
	const blLabelLoc = (getConfigValue('VISUALIZATION.BASELINE_LABEL.LOCATION') as string) || 'BOTTOM_LEFT';
	const blFontSize = (getConfigValue('VISUALIZATION.BASELINE_LABEL.TEXT_SIZE') as string) || '15px';
	const blFontWeight = (getConfigValue('VISUALIZATION.BASELINE_LABEL.TEXT_WEIGHT') as string) || '500';
	const blOffsetRight = parseInt((getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.RIGHT') as string) || '0');
	const blOffsetLeft = parseInt((getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.LEFT') as string) || '0');
	const blOffsetDown = parseInt((getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.DOWN') as string) || '0');
	const blOffsetUp = parseInt((getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.UP') as string) || '0');

	const baselineLabel = $derived.by(() => {
		if (!graphEngine.isInitialized || !graphStore.baselineUUID) return null;
		const data = frStore.get(graphStore.baselineUUID);
		if (!data) return null;
		const pos = graphEngine.labelPosition[blLabelLoc];
		if (!pos) return null;
		const identifier = data.identifier;
		const text = graphStore.baselineMode === 'withAdjustment'
			? `${identifier} (With Adjustment) Compensated`
			: `${identifier} Compensated`;
		return {
			x: pos.x + blOffsetRight - blOffsetLeft,
			y: pos.y + blOffsetDown - blOffsetUp,
			anchor: pos.anchor,
			text
		};
	});
	let overlay = $state<GraphEqOverlay | null>(null);
	let spectrumOverlay = $state<GraphSpectrumOverlay | null>(null);

	onMount(() => {
		if (svgEl) {
			graphEngine.init(svgEl, appStore.isMobile);
			overlay = new GraphEqOverlay(graphEngine);
			graphEngine.eqOverlay = overlay;
			spectrumOverlay = new GraphSpectrumOverlay(graphEngine);
		}
	});

	onDestroy(() => {
		overlay?.destroy();
		overlay = null;
		spectrumOverlay?.destroy();
		spectrumOverlay = null;
	});

	$effect(() => {
		// Iterate entries to subscribe to all SvelteMap mutations,
		// including same-key value updates (visibility, channel, normalize, smooth, y-offset).
		// A bare reference `frStore.entries` only tracks size changes, not value mutations.
		for (const _ of frStore.entries) { /* reactive subscription */ }
		// Track EQ state so curves re-render with ghost opacity when EQ is toggled
		const _eqEnabled = eqStore.isEnabled;
		const _eqSource = eqStore.sourcePhoneUUID;
		if (graphEngine.isInitialized) {
			graphEngine.refreshEveryFRCurves();
		}
	});

	// Notify GraphInspection when labels change (hides labels when inspection is active)
	$effect(() => {
		const _labels = labelData.entries;
		if (graphEngine.isInitialized && graphEngine.graphInspection) {
			graphEngine.graphInspection.onLabelsUpdated();
		}
	});

	$effect(() => {
		const _yScale = graphStore.yScale;
		if (graphEngine.isInitialized) {
			graphEngine.updateYScale(String(graphStore.yScale));
			spectrumOverlay?.updateScales();
		}
	});

	$effect(() => {
		const enabled = audioSpectrumStore.isEnabled;
		const analyser = audioSpectrumStore.analyserNode;
		if (graphEngine.isInitialized && spectrumOverlay) {
			if (enabled && analyser) {
				spectrumOverlay.start(analyser);
			} else {
				spectrumOverlay.stop();
			}
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
		const eqCurveUUID = eqStore.eqCurveUUID;
		// Track EQ curve data (post-normalization) for node positioning
		const _eqCurveData = eqCurveUUID ? frStore.get(eqCurveUUID) : null;
		// Track source phone data for ghost opacity changes
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
	<!-- Static elements (Svelte-managed, rendered before D3 content) -->
	{#if graphEngine.isInitialized}
		<GraphWatermark viewBoxWidth={graphEngine.viewBoxWidth} viewBoxHeight={graphEngine.viewBoxHeight} />
		<GraphXAxis
			xScale={(freq) => graphEngine.xScale(freq)}
			yTop={graphEngine.graphGeometry.yTop}
			yBottom={graphEngine.graphGeometry.yBottom}
		/>
	{/if}
	<!-- FR Labels (Svelte-managed) -->
	{#if labelData.entries.length > 0}
		<g class="fr-graph-label-bg" transform={labelTransform}>
			{#each labelData.entries as label (label.uuid + label.channel)}
				<rect
					class="fr-graph-label-bg-rect"
					x={-10}
					y={(label.index - 0.75) * labelLineHeight}
					rx={4}
					ry={4}
					width={label.text.length * labelLineHeight * 0.35}
					height={labelLineHeight}
					fill="var(--color-base-200)"
					opacity="0.7"
					filter="blur(4px)"
				/>
			{/each}
		</g>
		<g class="fr-graph-label" transform={labelTransform}>
			{#each labelData.entries as label (label.uuid + label.channel)}
				<text
					class="fr-graph-label-text"
					y={label.index * labelLineHeight}
					fill={label.color}
					style={labelData.style}
					text-anchor={labelData.anchor}
					font-size={labelFontSize}
					font-weight={labelFontWeight}
				>{label.text}</text>
			{/each}
		</g>
	{/if}
	<!-- Baseline label (Svelte-managed) -->
	{#if baselineLabel}
		<text
			class="fr-graph-baseline-text"
			x={baselineLabel.x}
			y={baselineLabel.y}
			text-anchor={baselineLabel.anchor}
			fill="var(--color-graph-axis-label)"
			font-size={blFontSize}
			font-weight={blFontWeight}
		>{baselineLabel.text}</text>
	{/if}
</svg>
