<script lang="ts">
	import * as d3 from 'd3';
	import * as m from '$lib/paraglide/messages.js';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import FRParser from '$lib/utils/fr-parser.js';
	import FRSmoother from '$lib/utils/fr-smoother.js';
	import { normalize } from '$lib/utils/fr-normalizer.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import type { FRDataPoint, ChannelData } from '$lib/types/data-types.js';

	// ── State ──────────────────────────────────────────────────────────────────

	let isVisible = $state(
		!!(getConfigValue('PREFERENCE_BOUND.ENABLE_BOUND_ON_INITIAL_LOAD') ?? false)
	);
	let isLoaded = $state(false);
	let rawBoundU = $state<FRDataPoint[] | null>(null);
	let rawBoundD = $state<FRDataPoint[] | null>(null);
	let rawDFData = $state<ChannelData | null>(null);

	// ── Derived: normalized DF target ─────────────────────────────────────────

	const dfNormalized = $derived.by((): ChannelData | null => {
		if (!rawDFData) return null;
		try {
			return normalize(rawDFData, graphStore.normType, graphStore.normHzValue);
		} catch {
			return rawDFData;
		}
	});

	// ── Data loading ──────────────────────────────────────────────────────────

	$effect(() => {
		if (!graphEngine.isInitialized || isLoaded) return;
		loadData();
	});

	async function loadData(): Promise<void> {
		try {
			const [textU, textD, textDF] = await Promise.all([
				fetch('/data/Bounds U.txt').then((r) => r.text()),
				fetch('/data/Bounds D.txt').then((r) => r.text()),
				fetchDFTarget()
			]);

			const parsedU = await FRParser.parseFRData(textU);
			const parsedD = await FRParser.parseFRData(textD);
			const parsedDF = await FRParser.parseFRData(textDF);

			rawBoundU = FRSmoother.smooth(parsedU.data);
			rawBoundD = FRSmoother.smooth(parsedD.data);
			rawDFData = { ...parsedDF, data: FRSmoother.smooth(parsedDF.data) };

			isLoaded = true;
		} catch (err) {
			console.error('PreferenceBound: failed to load data', err);
		}
	}

	function fetchDFTarget(): Promise<string> {
		const file = (
			getConfigValue('PREFERENCE_BOUND.BASE_DF_TARGET_FILE') as string | undefined
		) ?? 'KEMAR DF (KB006x) Target';
		const fileName = file.endsWith('.txt') ? file : `${file}.txt`;
		return fetch(`/data/${fileName}`).then((r) => {
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
		const baselineData = graphEngine.baselineData;

		const computeY = (freq: number, offset: number): number => {
			const dfY = interpolateAt(dfData, freq);
			if (baselineData.uuid !== null && baselineData.channelData) {
				const baselineY = interpolateAt(baselineData.channelData, freq);
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
		removeBounds();

		const pathStr = buildPathString();
		if (!pathStr) return;

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
	}

	function removeBounds(): void {
		graphEngine.curveGroup?.select('.preference-bound-area').remove();
	}

	// ── Reactive draw effect ──────────────────────────────────────────────────

	$effect(() => {
		const _baseline = graphStore.baselineUUID;
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

<button
	onclick={toggle}
	class="rounded border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
    {isVisible
		? 'border-accent bg-accent text-accent-foreground'
		: 'border-input bg-surface-raised text-foreground-secondary hover:bg-surface-hover hover:text-foreground'}"
>
	{m.pref_bound_btn_label()}
</button>
