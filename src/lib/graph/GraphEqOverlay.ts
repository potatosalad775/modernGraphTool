import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { Equalizer, type EQFilter } from '$lib/utils/equalizer.js';
import { lookupFRValueAtFreq } from '$lib/utils/fr-lookup.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import type { FRDataPoint, ParsedFRData } from '$lib/types/data-types.js';

interface BandDatum {
	filter: EQFilter;
	index: number;
}

/**
 * GraphEqOverlay — renders interactive EQ band nodes, EQ response curve,
 * and ghost (pre-EQ) curve on the graph SVG.
 *
 * PK (peaking) filter nodes are positioned directly on the EQ-modified FR
 * curve, matching the UX of pro audio EQ plugins (FabFilter Pro-Q, etc.).
 * LSQ/HSQ (shelf) filters keep absolute (freq, gain) positioning.
 *
 * Interaction model:
 *   - Drag horizontal  → adjust frequency
 *   - Drag vertical    → adjust gain (PK: relative to curve, shelf: absolute)
 *   - Scroll on node   → adjust Q (±0.1 per tick, clamped [0.1, 10])
 *   - Double-click     → remove band
 *   - Click empty area → add new PK band (only when EQ panel active + source phone selected)
 */
export class GraphEqOverlay {
	private graphEngine: GraphEngine;
	private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private clickRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
	private _eqPanelActive = false;
	private _dragThrottleTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
	private eq = new Equalizer();

	// ── Log-spaced frequency grid for EQ response curve ──────────────────────
	private static readonly EQ_CURVE_FREQS: number[] = (() => {
		const freqs: number[] = [];
		const minF = 20;
		const maxF = 20000;
		const n = 200;
		for (let i = 0; i <= n; i++) {
			freqs.push(minF * Math.pow(maxF / minF, i / n));
		}
		return freqs;
	})();

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this._createOverlayGroup();
	}

	destroy(): void {
		this._removeClickRect();
		this.overlayGroup.remove();
	}

	// ── SVG setup ──────────────────────────────────────────────────────────────

	private _createOverlayGroup(): void {
		this.overlayGroup = this.graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-eq-overlay');
		this.graphEngine.orderOverlayLayers();
	}

	// ── Public render API ──────────────────────────────────────────────────────

	render(): void {
		// Hide everything when EQ is globally disabled
		if (!eqStore.isEnabled) {
			this.overlayGroup.selectAll('.eq-band-node').remove();
			this._clearGhostCurve();
			this._clearEqResponseCurve();
			return;
		}

		const { xScale, yScale } = this.graphEngine.getScales();
		const filters = eqStore.filters;
		const sourceUUID = eqStore.sourcePhoneUUID;

		const enabledFilters = filters.filter(
			(f) => f.enabled && f.freq != null && f.q != null && f.gain != null
		);

		// Draw EQ response curve (filled area showing combined filter shape)
		this._renderEqResponseCurve(enabledFilters, xScale, yScale);

		// Draw ghost curve (original pre-EQ FR)
		this._renderGhostCurve(enabledFilters, xScale, yScale);

		// Data join for interactive nodes
		const data: BandDatum[] = filters
			.map((filter, index) => ({ filter, index }))
			.filter((d) => {
				if (!d.filter.enabled || d.filter.freq == null || d.filter.gain == null) return false;
				// PK nodes require a source phone (we need curve data for positioning)
				if (d.filter.type === 'PK' && !sourceUUID) return false;
				return true;
			});

		const nodes = this.overlayGroup
			.selectAll<SVGGElement, BandDatum>('.eq-band-node')
			.data(data, (d) => String(d.index));

		// EXIT
		nodes.exit().remove();

		// ENTER
		const entered = nodes
			.enter()
			.append('g')
			.attr('class', 'eq-band-node')
			.style('cursor', 'grab')
			.call(this._buildDragBehavior());

		// Transparent hit area (larger than visible dot for easier grabbing)
		entered
			.append('circle')
			.attr('class', 'eq-hit-area')
			.attr('r', 16)
			.attr('fill', 'transparent');

		// Q ring
		entered
			.append('circle')
			.attr('class', 'eq-q-ring')
			.attr('fill', 'none')
			.attr('stroke', 'var(--color-primary)')
			.attr('stroke-width', 1.5)
			.attr('opacity', 0.5);

		// Center dot
		entered
			.append('circle')
			.attr('class', 'eq-center-dot')
			.attr('r', 6)
			.attr('fill', 'var(--color-primary)')
			.attr('opacity', 0.9);

		// Freq label
		entered
			.append('text')
			.attr('class', 'eq-freq-label')
			.attr('text-anchor', 'middle')
			.attr('dy', '-10')
			.attr('font-size', '10px')
			.attr('fill', 'var(--color-base-content)')
			.style('pointer-events', 'none')
			.style('user-select', 'none');

		// Double-click to remove
		entered.on('dblclick', (_event: MouseEvent, d: BandDatum) => {
			eqStore.removeBandAt(d.index);
		});

		// Scroll to adjust Q
		entered.on(
			'wheel',
			(event: WheelEvent, d: BandDatum) => {
				event.preventDefault();
				const delta = event.deltaY > 0 ? -0.1 : 0.1;
				const newQ = Math.max(0.1, Math.min(10, d.filter.q! + delta));
				eqStore.updateBandAt(d.index, { q: parseFloat(newQ.toFixed(2)) });
			},
			{ passive: false } as EventListenerOptions
		);

		// UPDATE (entered + updated)
		const merged = entered.merge(nodes);

		merged.attr('transform', (d) => {
			const freq = Math.max(20, Math.min(20000, d.filter.freq!));
			const x = xScale(freq);

			if (d.filter.type === 'PK') {
				// PK: position on the EQ-modified FR curve
				const curveDb = this._getCurveDbAtFreq(freq);
				if (curveDb === null) return 'translate(-100,-100)';
				return `translate(${x},${yScale(curveDb)})`;
			} else {
				// LSQ/HSQ: absolute gain positioning
				const y = yScale(Math.max(-40, Math.min(40, d.filter.gain!)));
				return `translate(${x},${y})`;
			}
		});

		merged
			.select<SVGCircleElement>('.eq-q-ring')
			.attr('r', (d) => this._qToRadius(d.filter.q!));

		merged
			.select<SVGTextElement>('.eq-freq-label')
			.text((d) => this._formatFreq(d.filter.freq!));
	}

	setEqPanelActive(active: boolean): void {
		if (active !== this._eqPanelActive) {
			this._eqPanelActive = active;
			this._updateClickRect();
		}
	}

	// ── Ghost curve ───────────────────────────────────────────────────────────

	private _renderGhostCurve(
		enabledFilters: EQFilter[],
		xScale: d3.ScaleLogarithmic<number, number>,
		yScale: d3.ScaleLinear<number, number>
	): void {
		this._clearGhostCurve();

		const sourceUUID = eqStore.sourcePhoneUUID;
		if (!sourceUUID || enabledFilters.length === 0) return;

		const originalData = eqStore.originalDataCache.get(sourceUUID);
		if (!originalData) return;

		// Pick same channel as the main displayed curve
		const channelData = this._pickChannelData(originalData);
		if (!channelData) return;

		const smoothed = FRSmoother.smooth(channelData);

		// Build path with baseline compensation (same logic as GraphEngine._getCompensatedPath)
		const baselineData = this.graphEngine.baselineData;
		const isBaselineValid =
			Array.isArray(baselineData.channelData) && baselineData.channelData.length > 0;

		const sourceObj = frStore.get(sourceUUID);
		const yOff = sourceObj?.yOffset ?? 0;

		const bisect = d3.bisector<FRDataPoint, number>((p) => p[0]).left;

		const lineGenerator = d3
			.line<FRDataPoint>()
			.x((d) => xScale(d[0]))
			.y((d) => {
				let db = d[1];
				if (isBaselineValid) {
					const chData = baselineData.channelData!;
					const i = bisect(chData, d[0], 0);
					const a = chData[i - 1];
					const b = chData[i];
					let baselineY = 0;
					if (a && b) {
						const t = (d[0] - a[0]) / (b[0] - a[0]);
						baselineY = a[1] + t * (b[1] - a[1]);
					} else if (a) {
						baselineY = a[1];
					} else if (b) {
						baselineY = b[1];
					}
					db -= baselineY;
				}
				return yScale(db + yOff);
			})
			.curve(d3.curveMonotoneX);

		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;

		this.overlayGroup
			.insert('path', ':first-child')
			.attr('class', 'eq-ghost-curve')
			.attr('d', lineGenerator(smoothed))
			.attr('fill', 'none')
			.attr('stroke', 'var(--color-eq-ghost-curve)')
			.attr('stroke-width', 1.5)
			.attr('stroke-dasharray', '6 4')
			.attr('clip-path', `polygon(${xStart}px ${yTop}px, ${xEnd}px ${yTop}px, ${xEnd}px ${yBottom}px, ${xStart}px ${yBottom}px)`)
			.style('pointer-events', 'none');
	}

	private _clearGhostCurve(): void {
		this.overlayGroup.selectAll('.eq-ghost-curve').remove();
	}

	// ── EQ Response curve (filled area) ───────────────────────────────────────

	private _renderEqResponseCurve(
		enabledFilters: EQFilter[],
		xScale: d3.ScaleLogarithmic<number, number>,
		yScale: d3.ScaleLinear<number, number>
	): void {
		this._clearEqResponseCurve();

		if (enabledFilters.length === 0) return;

		const preamp = eqStore.preamp;
		const freqs = GraphEqOverlay.EQ_CURVE_FREQS;
		const gains = this.eq.calculateGainsFromFilter(freqs, enabledFilters);

		// Build area data: each point has [freq, eqGain]
		type AreaPoint = { freq: number; gain: number };
		const areaData: AreaPoint[] = freqs.map((f, i) => ({
			freq: f,
			gain: gains[i] + preamp
		}));

		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;
		const zeroY = yScale(0);

		// Positive (boost) area
		const boostArea = d3
			.area<AreaPoint>()
			.x((d) => xScale(d.freq))
			.y0(() => zeroY)
			.y1((d) => {
				const g = Math.max(0, d.gain);
				return g === 0 ? zeroY : yScale(g);
			})
			.curve(d3.curveMonotoneX);

		// Negative (cut) area
		const cutArea = d3
			.area<AreaPoint>()
			.x((d) => xScale(d.freq))
			.y0(() => zeroY)
			.y1((d) => {
				const g = Math.min(0, d.gain);
				return g === 0 ? zeroY : yScale(g);
			})
			.curve(d3.curveMonotoneX);

		const clipPath = `polygon(${xStart}px ${yTop}px, ${xEnd}px ${yTop}px, ${xEnd}px ${yBottom}px, ${xStart}px ${yBottom}px)`;

		this.overlayGroup
			.insert('path', '.eq-ghost-curve, .eq-band-node')
			.attr('class', 'eq-response-boost')
			.attr('d', boostArea(areaData))
			.attr('fill', 'var(--color-eq-response-boost)')
			.attr('clip-path', clipPath)
			.style('pointer-events', 'none');

		this.overlayGroup
			.insert('path', '.eq-ghost-curve, .eq-band-node')
			.attr('class', 'eq-response-cut')
			.attr('d', cutArea(areaData))
			.attr('fill', 'var(--color-eq-response-cut)')
			.attr('clip-path', clipPath)
			.style('pointer-events', 'none');
	}

	private _clearEqResponseCurve(): void {
		this.overlayGroup.selectAll('.eq-response-boost, .eq-response-cut').remove();
	}

	// ── Curve lookup helpers ──────────────────────────────────────────────────

	/**
	 * Get the smoothed FR data for the source phone's primary displayed channel.
	 * This matches what GraphEngine._drawPhoneCurve renders.
	 */
	private _getSourceChannelData(): FRDataPoint[] | null {
		const sourceUUID = eqStore.sourcePhoneUUID;
		if (!sourceUUID) return null;
		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return null;

		const channelData = this._pickChannelData(sourceData.channels);
		if (!channelData) return null;

		return FRSmoother.smooth(channelData);
	}

	/**
	 * Pick the primary channel data from ParsedFRData.
	 * Prefers AVG, then falls back to first displayed channel.
	 */
	private _pickChannelData(channels: ParsedFRData): FRDataPoint[] | null {
		const sourceUUID = eqStore.sourcePhoneUUID;
		const sourceData = sourceUUID ? frStore.get(sourceUUID) : null;
		const dispChannels = sourceData?.dispChannel ?? ['AVG'];

		let channelKey: 'L' | 'R' | 'AVG';
		if (channels.AVG && dispChannels.includes('AVG')) {
			channelKey = 'AVG';
		} else if (channels.AVG) {
			channelKey = 'AVG';
		} else {
			channelKey = (dispChannels[0] ?? 'L') as 'L' | 'R' | 'AVG';
		}

		const ch = channels[channelKey];
		if (!ch?.data?.length) return null;
		return ch.data;
	}

	/**
	 * Get the dB value of the displayed curve at a given frequency.
	 * Accounts for smoothing, baseline compensation, and y-offset.
	 */
	private _getCurveDbAtFreq(freq: number): number | null {
		const smoothedData = this._getSourceChannelData();
		if (!smoothedData) return null;

		const curveDb = lookupFRValueAtFreq(smoothedData, freq);
		if (curveDb === null) return null;

		let compensatedDb = curveDb;

		// Baseline compensation
		const baselineData = this.graphEngine.baselineData;
		if (
			Array.isArray(baselineData.channelData) &&
			baselineData.channelData.length > 0
		) {
			const baselineDb = lookupFRValueAtFreq(baselineData.channelData, freq);
			if (baselineDb !== null) {
				compensatedDb -= baselineDb;
			}
		}

		// Y-offset
		const sourceUUID = eqStore.sourcePhoneUUID;
		if (sourceUUID) {
			const sourceData = frStore.get(sourceUUID);
			if (sourceData?.yOffset) {
				compensatedDb += sourceData.yOffset;
			}
		}

		return compensatedDb;
	}

	/**
	 * Get curve dB at freq with a specific filter's contribution removed.
	 * Used during PK drag to compute "base curve without this filter".
	 */
	private _getCurveDbExcludingFilter(freq: number, excludeIndex: number): number | null {
		const curveDb = this._getCurveDbAtFreq(freq);
		if (curveDb === null) return null;

		const filter = eqStore.filters[excludeIndex];
		if (!filter?.enabled || !filter.freq || !filter.q || filter.gain == null) return curveDb;

		const thisFilterGain = this.eq.calculateGainsFromFilter([freq], [filter])[0];
		return curveDb - thisFilterGain;
	}

	// ── Drag behavior ──────────────────────────────────────────────────────────

	private _buildDragBehavior() {
		let dragState: {
			isPK: boolean;
			baseCurveDb: number | null;
		} | null = null;

		return d3
			.drag<SVGGElement, BandDatum>()
			.on('start', (_event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				d3.select(_event.sourceEvent?.target?.closest?.('.eq-band-node') as Element ?? _event.sourceEvent.currentTarget)
					.style('cursor', 'grabbing')
					.raise();

				const isPK = d.filter.type === 'PK';
				if (isPK) {
					const baseCurveDb = this._getCurveDbExcludingFilter(d.filter.freq!, d.index);
					dragState = { isPK: true, baseCurveDb };
				} else {
					dragState = { isPK: false, baseCurveDb: null };
				}
			})
			.on('drag', (event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				const { xScale: xs, yScale: ys } = this.graphEngine.getScales();
				const freq = Math.max(20, Math.min(20000, xs.invert(event.x)));

				let gain: number;
				let visualY: number;

				if (dragState?.isPK && dragState.baseCurveDb !== null) {
					// PK on curve: gain = cursor dB position minus base curve value
					const targetDb = ys.invert(event.y);
					gain = Math.max(-40, Math.min(40, targetDb - dragState.baseCurveDb));
					// Node follows the cursor directly (it's on the curve)
					visualY = event.y;

					// Recompute baseCurveDb at new freq if frequency changed significantly
					// (the base curve shape varies across frequency)
					const origFreq = d.filter.freq!;
					if (Math.abs(freq - origFreq) / origFreq > 0.05) {
						const newBase = this._getCurveDbExcludingFilter(freq, d.index);
						if (newBase !== null) {
							dragState.baseCurveDb = newBase;
							gain = Math.max(-40, Math.min(40, targetDb - newBase));
						}
					}
				} else {
					// LSQ/HSQ: absolute gain positioning (unchanged)
					gain = Math.max(-40, Math.min(40, ys.invert(event.y)));
					visualY = ys(gain);
				}

				// Move node visually with zero latency
				this.overlayGroup
					.selectAll<SVGGElement, BandDatum>('.eq-band-node')
					.filter((n) => n.index === d.index)
					.attr('transform', `translate(${xs(freq)},${visualY})`);

				// Throttle state update to ~60fps
				if (!this._dragThrottleTimers.has(d.index)) {
					this._dragThrottleTimers.set(
						d.index,
						setTimeout(() => {
							this._dragThrottleTimers.delete(d.index);
							eqStore.updateBandAt(d.index, {
								freq: Math.round(freq),
								gain: parseFloat(gain.toFixed(1))
							});
						}, 16)
					);
				}
			})
			.on(
				'end',
				(event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
					const { xScale: xs, yScale: ys } = this.graphEngine.getScales();
					const freq = Math.max(20, Math.min(20000, xs.invert(event.x)));

					let gain: number;

					if (dragState?.isPK && dragState.baseCurveDb !== null) {
						const targetDb = ys.invert(event.y);
						gain = Math.max(-40, Math.min(40, targetDb - dragState.baseCurveDb));
					} else {
						gain = Math.max(-40, Math.min(40, ys.invert(event.y)));
					}

					// Cancel pending throttle and commit final position
					const pending = this._dragThrottleTimers.get(d.index);
					if (pending !== undefined) {
						clearTimeout(pending);
						this._dragThrottleTimers.delete(d.index);
					}
					eqStore.updateBandAt(d.index, {
						freq: Math.round(freq),
						gain: parseFloat(gain.toFixed(1))
					});

					this.overlayGroup
						.selectAll<SVGGElement, BandDatum>('.eq-band-node')
						.filter((n) => n.index === d.index)
						.style('cursor', 'grab');

					dragState = null;
				}
			);
	}

	// ── Click-to-add ───────────────────────────────────────────────────────────

	private _updateClickRect(): void {
		if (this._eqPanelActive && eqStore.sourcePhoneUUID) {
			this._addClickRect();
		} else {
			this._removeClickRect();
		}
	}

	private _addClickRect(): void {
		if (this.clickRect) return;
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;
		this.clickRect = this.overlayGroup
			.insert('rect', ':first-child') // below nodes
			.attr('class', 'eq-click-area')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop)
			.attr('fill', 'transparent')
			.style('cursor', 'crosshair')
			.on('click', (event: MouseEvent) => {
				if (!eqStore.isEnabled || !eqStore.sourcePhoneUUID) return;
				// Don't fire when clicking on a node
				if ((event.target as Element).closest?.('.eq-band-node')) return;
				const { xScale, yScale } = this.graphEngine.getScales();
				const [mx, my] = d3.pointer(event);
				const freq = Math.round(Math.max(20, Math.min(20000, xScale.invert(mx))));
				const clickedDb = yScale.invert(my);

				// PK on curve: gain = clicked position minus current curve value
				const curveDb = this._getCurveDbAtFreq(freq);
				if (curveDb !== null) {
					const gain = parseFloat(
						Math.max(-40, Math.min(40, clickedDb - curveDb)).toFixed(1)
					);
					eqStore.addBand({ enabled: true, type: 'PK', freq, q: 1.0, gain });
				}
			});
		this.graphEngine.orderOverlayLayers();
	}

	private _removeClickRect(): void {
		if (!this.clickRect) return;
		this.clickRect.remove();
		this.clickRect = null;
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	private _qToRadius(q: number): number {
		return Math.min(40, Math.max(8, 20 / Math.sqrt(q)));
	}

	private _formatFreq(freq: number): string {
		if (freq >= 1000) return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`;
		return String(Math.round(freq));
	}
}
