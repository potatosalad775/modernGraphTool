<script module lang="ts">
	import type { ChannelData } from '$lib/types/data-types.js';

	// Module-level fetch promise: deduplicates concurrent calls AND persists across remounts.
	// The first call creates the promise; all subsequent calls (concurrent or later) reuse it.
	let _dataPromise: Promise<{
		boundU: ChannelData;
		boundD: ChannelData;
		dfTarget: ChannelData;
	}> | null = null;
</script>

<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { resolveBaselineChannelData } from '$lib/graph/baseline.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import FRParser from '$lib/utils/fr-parser.js';
	import FRSmoother from '$lib/utils/fr-smoother.js';
	import { normalize } from '$lib/utils/fr-normalizer.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import type { FRDataPoint } from '$lib/types/data-types.js';
	import Button from '../atoms/Button.svelte';

	// ── Config-driven enable/disable ──────────────────────────────────────────
	const baseDFTarget =
		(getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined) ?? '';
	const isEnabled = !!baseDFTarget;

	// ── State ──────────────────────────────────────────────────────────────────

	let isVisible = $state(
		isEnabled && !!(getConfigValue('PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD') ?? false)
	);
	let isLoaded = $state(false);
	let rawBoundU = $state.raw<FRDataPoint[] | null>(null);
	let rawBoundD = $state.raw<FRDataPoint[] | null>(null);
	let rawDFData = $state.raw<ChannelData | null>(null);

	// ── Derived: normalized DF target ─────────────────────────────────────────

	const dfNormalized = $derived.by((): ChannelData | null => {
		if (!rawDFData) return null;
		try {
			return normalize(rawDFData, graphStore.normType, graphStore.normHzValue);
		} catch {
			return rawDFData;
		}
	});

	// ── Derived: reactive baseline channel data ──────────────────────────────
	// Shares resolution logic with GraphEngine.refreshBaselineData() via
	// resolveBaselineChannelData, so the overlay redraws when baseline mode
	// or data changes.

	const baselineChannelData = $derived(
		resolveBaselineChannelData(graphStore.baselineUUID, graphStore.baselineMode)
	);

	// ── Data loading ──────────────────────────────────────────────────────────

	$effect(() => {
		if (!isEnabled || !graphEngine.isInitialized || isLoaded) return;
		loadData();
	});

	async function loadData(): Promise<void> {
		try {
			if (!_dataPromise) {
				_dataPromise = (async () => {
					const [textU, textD, textDF] = await Promise.all([
						fetch(resolve('/data/Bounds U.txt' as '/', {})).then((r) => r.text()),
						fetch(resolve('/data/Bounds D.txt' as '/', {})).then((r) => r.text()),
						fetchDFTarget()
					]);
					return {
						boundU: await FRParser.parseFRData(textU),
						boundD: await FRParser.parseFRData(textD),
						dfTarget: await FRParser.parseFRData(textDF)
					};
				})();
			}
			const { boundU, boundD, dfTarget } = await _dataPromise;

			rawBoundU = FRSmoother.smooth(boundU.data, graphStore.smoothValue);
			rawBoundD = FRSmoother.smooth(boundD.data, graphStore.smoothValue);
			rawDFData = { ...dfTarget, data: FRSmoother.smooth(dfTarget.data, graphStore.smoothValue) };

			isLoaded = true;
		} catch (err) {
			console.error('PreferenceBound: failed to load data', err);
			_dataPromise = null; // Allow retry on failure
		}
	}

	function fetchDFTarget(): Promise<string> {
		const targetName = baseDFTarget.trim().endsWith(' Target')
			? baseDFTarget
			: `${baseDFTarget} Target`;
		const fileName = targetName.endsWith('.txt') ? targetName : `${targetName}.txt`;
		const base =
			(getConfigValue('PATH.TARGET_MEASUREMENT') as string | undefined) ?? './data/target';
		const url = `${base}${base.endsWith('/') ? '' : '/'}${fileName}`;
		return fetch(url).then((r) => {
			if (!r.ok) throw new Error(`Failed to fetch DF target: ${fileName}`);
			return r.text();
		});
	}

	// ── Push reactive state into the engine-owned overlay ──────────────────────
	// Imperative D3 rendering lives in GraphPreferenceBoundOverlay; this effect feeds
	// it the latest reactive data and visibility. Reading graphEngine.preferenceBoundOverlay
	// ($state) re-runs the effect once GraphContainer assigns the overlay. Handle-drag
	// repositioning is driven separately via GraphEngine.repositionCurves() → overlay.render().

	$effect(() => {
		const ov = graphEngine.preferenceBoundOverlay;
		if (!graphEngine.isInitialized || !ov) return;
		ov.update({
			visible: isVisible,
			rawBoundU,
			rawBoundD,
			dfNormalized,
			baselineChannelData
		});
	});

	// Clear the overlay if this component unmounts while the graph survives.
	onDestroy(() => graphEngine.preferenceBoundOverlay?.clear());

	// ── Toggle handler ────────────────────────────────────────────────────────

	function toggle(): void {
		isVisible = !isVisible;
	}
</script>

{#if isEnabled}
	<Button
		title={m.pref_bound_btn_label()}
		onclick={toggle}
		variant={isVisible ? 'primary' : 'outline'}
		class="h-9! gap-1.5 px-3!"
	>
		{m.pref_bound_btn_label()}
	</Button>
{/if}
