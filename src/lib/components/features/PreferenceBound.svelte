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
	import * as d3 from 'd3';
	import * as m from '$lib/paraglide/messages.js';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import FRParser from '$lib/utils/fr-parser.js';
	import FRSmoother from '$lib/utils/fr-smoother.js';
	import { normalize } from '$lib/utils/fr-normalizer.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { resolve } from '$app/paths';
	import type { FRDataPoint } from '$lib/types/data-types.js';
	import Button from '../atoms/Button.svelte';

	// ── Config-driven enable/disable ──────────────────────────────────────────
	const baseDFTarget = (getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined) ?? '';
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
	// Mirrors GraphEngine.refreshBaselineData() but through Svelte reactivity,
	// so PreferenceBound redraws when baseline mode or data changes.

	const baselineChannelData = $derived.by((): FRDataPoint[] | null => {
		const uuid = graphStore.baselineUUID;
		if (!uuid) return null;

		if (graphStore.baselineMode === 'withAdjustment') {
			const original = graphStore.targetOriginalData.get(uuid);
			return original?.AVG?.data ?? null;
		}

		const data = frStore.get(uuid);
		if (!data) return null;
		if (data.type === 'phone') {
			const ch =
				data.dispChannel.includes('L') && data.dispChannel.includes('R')
					? 'AVG'
					: data.dispChannel[0];
			return data.channels[ch]?.data ?? null;
		}
		return data.channels.AVG?.data ?? null;
	});

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
						dfTarget: await FRParser.parseFRData(textDF),
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
		const targetName = baseDFTarget.trim().endsWith(' Target') ? baseDFTarget : `${baseDFTarget} Target`;
		const fileName = targetName.endsWith('.txt') ? targetName : `${targetName}.txt`;
		const base = (getConfigValue('PATH.TARGET_MEASUREMENT') as string | undefined) ?? './data/target';
		const url = `${base}${base.endsWith('/') ? '' : '/'}${fileName}`;
		return fetch(url).then((r) => {
			if (!r.ok) throw new Error(`Failed to fetch DF target: ${fileName}`);
			return r.text();
		});
	}

	// ── Interpolation helper ──────────────────────────────────────────────────

	function interpolateAt(data: FRDataPoint[], freq: number): number {
		const bisect = d3.bisector((d: FRDataPoint) => d[0]).left;
		const i = bisect(data, freq, 0);
		const a = data[i - 1];
		const b = data[i];
		if (a && b) {
			const t = (freq - a[0]) / (b[0] - a[0]);
			return a[1] + t * (b[1] - a[1]);
		}
		return a ? a[1] : b ? b[1] : 0;
	}

	// ── Path building ─────────────────────────────────────────────────────────

	function buildPathString(): string | null {
		if (!rawBoundU || !rawBoundD || !dfNormalized) return null;

		const { xScale, yScale } = graphEngine;
		const dfData = dfNormalized.data;

		const computeY = (freq: number, offset: number): number => {
			const dfY = interpolateAt(dfData, freq);
			if (baselineChannelData) {
				const baselineY = interpolateAt(baselineChannelData, freq);
				return yScale(dfY + offset - baselineY);
			}
			return yScale(dfY + offset);
		};

		const lineGen = (pts: FRDataPoint[]) =>
			d3
				.line<FRDataPoint>()
				.x((d) => xScale(d[0]))
				.y((d) => computeY(d[0], d[1]))
				.curve(d3.curveLinear)(pts) ?? '';

		const upperPath = lineGen(rawBoundU);
		const lowerPath = lineGen([...rawBoundD].reverse());

		return upperPath + lowerPath.replace(/^M/, 'L') + 'Z';
	}

	// ── D3 draw/remove helpers ────────────────────────────────────────────────

	function drawBounds(): void {
		if (!graphEngine.curveGroup) return;

		const pathStr = buildPathString();
		if (!pathStr) {
			removeBounds();
			return;
		}

		const existing = graphEngine.curveGroup.select<SVGPathElement>('.preference-bound-area');

		if (existing.empty()) {
			// First draw: create element without animation
			const fillColor =
				(getConfigValue('PREFERENCE_BOUND.COLOR_FILL') as string | undefined) ??
				'rgba(180,180,180,0.2)';
			const strokeColor =
				(getConfigValue('PREFERENCE_BOUND.COLOR_BORDER') as string | undefined) ??
				'rgba(120,120,120,0.5)';

			graphEngine.curveGroup
				.insert('path', ':first-child')
				.attr('class', 'preference-bound-area')
				.attr('d', pathStr)
				.attr('fill', fillColor)
				.attr('stroke', strokeColor)
				.attr('stroke-width', 1)
				.style('pointer-events', 'none');
		} else {
			// Subsequent updates: animate transition
			existing.interrupt();
			const oldPath = existing.attr('d') ?? '';
			const numericPattern = /-?\d+\.?\d*(e[+-]?\d+)?/gi;
			const oldCount = (oldPath.match(numericPattern) ?? []).length;
			const newCount = (pathStr.match(numericPattern) ?? []).length;

			if (oldCount === newCount && oldCount > 0) {
				existing
					.transition()
					.duration(graphEngine.transitionDuration)
					.attrTween('d', () => (t: number) => d3.interpolateString(oldPath, pathStr)(t));
			} else {
				existing.attr('d', pathStr);
			}
		}
	}

	function removeBounds(): void {
		const el = graphEngine.curveGroup?.select('.preference-bound-area');
		if (el && !el.empty()) {
			el.interrupt();
			el.remove();
		}
	}

	// ── Reactive draw effect ──────────────────────────────────────────────────

	$effect(() => {
		const _baseline = baselineChannelData;
		const _yScale = graphStore.yScale;
		const _dfNorm = dfNormalized;
		const _loaded = isLoaded;
		const _visible = isVisible;

		if (!graphEngine.isInitialized || !_visible || !_loaded || !rawBoundU || !rawBoundD || !_dfNorm) {
			removeBounds();
			return;
		}

		drawBounds();

		return () => {
			removeBounds();
		};
	});

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
	class="h-9! px-3! gap-1.5"
>
	{m.pref_bound_btn_label()}
</Button>
{/if}
