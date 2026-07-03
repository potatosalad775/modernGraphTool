import * as d3 from 'd3';
import type {
	FRDataObject,
	FRDataPoint,
	BaselineData,
	HpTFEnvelope
} from '$lib/types/data-types.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import GraphHandle from './GraphHandle.js';
import GraphInspection from './GraphInspection.js';
import { getConfigValue } from '$lib/utils/config.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { resolveBaselineChannelData } from './baseline.js';
import type { PreferenceBoundOverlayApi } from './GraphPreferenceBoundOverlay.js';

class GraphEngine {
	// ── Property declarations ──────────────────────────────────────────────────
	viewBoxWidth: number;
	viewBoxHeight: number;
	graphGeometry: { xStart: number; xEnd: number; yTop: number; yBottom: number };
	labelPosition: Record<
		string,
		{ x: number; y: number; anchor: string; growUp: boolean; style?: string }
	>;
	baselineData: BaselineData;
	transitionDuration: number;
	yScaleValue = 50;
	svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	graphHandle!: GraphHandle;
	graphInspection!: GraphInspection;
	_updateCurveRAF: number | null = null;
	xScale!: d3.ScaleLogarithmic<number, number>;
	yScale!: d3.ScaleLinear<number, number>;
	/** Y scale without handle pan shift — used by EQ overlay for node positioning */
	baseYScale!: d3.ScaleLinear<number, number>;
	curveGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	/** Optional EQ overlay reference — set by GraphContainer for handle-drag coordination */
	eqOverlay: { render(): void } | null = null;
	/** Preference-bound overlay reference — set by GraphContainer. `$state` so the
	 *  separately-mounted PreferenceBound toolbar component re-runs its push effect
	 *  once this is assigned (cf. `eqOverlay`, which lives in the same component). */
	preferenceBoundOverlay = $state<PreferenceBoundOverlayApi | null>(null);
	isInitialized = $state(false);

	constructor() {
		// Compute viewBox dimensions from configured aspect ratio
		const aspectRatio = (getConfigValue('VISUALIZATION.ASPECT_RATIO') as string) || '16:9';
		this.viewBoxWidth = 800;
		this.viewBoxHeight = aspectRatio === 'CrinGraph' ? 346 : 450;

		const margin = 15;
		this.graphGeometry = {
			xStart: margin,
			xEnd: this.viewBoxWidth - margin,
			yTop: margin,
			yBottom: this.viewBoxHeight - margin
		};
		const g = this.graphGeometry;
		this.labelPosition = {
			BOTTOM_LEFT: { x: g.xStart, y: g.yBottom, anchor: 'start', growUp: true },
			BOTTOM_RIGHT: { x: g.xEnd, y: g.yBottom, anchor: 'end', growUp: true },
			TOP_LEFT: { x: g.xStart, y: g.yTop, anchor: 'start', growUp: false },
			TOP_RIGHT: { x: g.xEnd, y: g.yTop, anchor: 'end', growUp: false },
			CENTER: {
				x: (g.xStart + g.xEnd) / 2,
				y: (g.yTop + g.yBottom) / 2,
				anchor: 'middle',
				growUp: false
			}
		};
		this.baselineData = {
			uuid: null,
			identifier: null,
			channelData: null
		};
		this.transitionDuration = 300;
	}

	/** Initialize GraphEngine with bound SVG element */
	init(svgEl: SVGSVGElement, isMobile = false): void {
		this.yScaleValue =
			parseInt((getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as string) || '50') || 50;
		graphStore.yScale = this.yScaleValue;

		this.svg = d3
			.select(svgEl)
			.attr('viewBox', `0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}`)
			.attr('preserveAspectRatio', 'xMidYMid meet');

		this._setupScales();
		this._drawAxis();
		this._drawFadeGradient();
		this._createCurveGroup();

		this.graphHandle = new GraphHandle(this.svg, this, isMobile);
		this.graphInspection = new GraphInspection(this);

		this.isInitialized = true;
	}

	/** Update the graph with new data — coalesced via requestAnimationFrame */
	refreshEveryFRCurves(): void {
		if (this._updateCurveRAF !== null) {
			cancelAnimationFrame(this._updateCurveRAF);
		}

		this._updateCurveRAF = requestAnimationFrame(() => {
			this.refreshBaselineData();
			this.curveGroup.attr('transform', 'translate(0,0)');

			this.svg
				.select('.fr-graph-curve-container')
				.selectAll("path[class*='fr-graph-'][class*='-curve']")
				.interrupt()
				.remove();

			frStore.entries.forEach((obj, uuid) => {
				if (!obj.hidden) {
					this.drawFRCurve(uuid);
				}
			});

			this.orderOverlayLayers();
			this._updateCurveRAF = null;
		});
	}

	/** Update Y Scale of Graph */
	updateYScale(scale: string): void {
		this.yScaleValue = parseInt(scale);
		graphStore.yScale = this.yScaleValue;
		this._setupScales();
		this.graphHandle.resetHandle();
		this.updateYAxis();

		this.curveGroup
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)")
			.interrupt()
			.transition()
			.duration(this.transitionDuration)
			.attr('d', (d) => this._getCompensatedPath(d as FRDataPoint[]));

		this._transitionHpTFFillPaths(true);
	}

	/** Refresh baseline channel data from latest frStore entry (after re-smooth, re-normalize, etc.) */
	refreshBaselineData(): void {
		if (!this.baselineData.uuid) return;
		if (!frStore.get(this.baselineData.uuid)) {
			// Baseline entry was removed
			this.baselineData = { uuid: null, identifier: null, channelData: null };
			graphStore.baselineUUID = null;
			graphStore.baselineMode = 'off';
			return;
		}
		this.baselineData.channelData = resolveBaselineChannelData(
			this.baselineData.uuid,
			graphStore.baselineMode
		);
	}

	/**
	 * Update Baseline Data.
	 *
	 * Callers must set `graphStore.baselineMode` before calling this with `enable: true` —
	 * channel data is resolved via `resolveBaselineChannelData`, the single source of truth
	 * for baseline resolution, which reads the mode from the store. An explicit
	 * `channelData` override is still accepted for callers restoring a specific snapshot
	 * (e.g. URL state restoration) that shouldn't re-derive it.
	 */
	updateBaselineData(
		enable: boolean,
		{
			uuid = null,
			channelData = null
		}: { uuid?: string | null; channelData?: FRDataPoint[] | null } = {}
	): void {
		if (!enable) {
			this.baselineData = { uuid: null, identifier: null, channelData: null };
		} else {
			if (uuid === null) {
				console.error('Baseline UUID is not defined');
				return;
			}
			const baselineMetaData = frStore.get(uuid);
			if (!baselineMetaData) {
				console.error('Baseline data not found for UUID:', uuid);
				return;
			}
			this.baselineData = {
				uuid,
				identifier: baselineMetaData.identifier,
				channelData:
					channelData !== null ? channelData : resolveBaselineChannelData(uuid, graphStore.baselineMode)
			};
		}

		graphStore.baselineUUID = this.baselineData.uuid;
		this.updateBaseline(true);
	}

	/** Update Baseline on Graph */
	updateBaseline(animate = false): void {
		// Use self alias to access GraphEngine instance inside attrTween
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this.curveGroup
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)")
			.interrupt()
			.transition()
			.duration(animate ? this.transitionDuration : 0)
			.attrTween('d', function (d) {
				const path = d3.select(this as Element);
				const oldPath = path.attr('d') ?? '';
				const newPath = self._getCompensatedPath(d as FRDataPoint[]) ?? '';
				return (t) => d3.interpolateString(oldPath, newPath)(t);
			});

		this._transitionHpTFFillPaths(animate);
	}

	/** Update visibility of curves */
	updateVisibility(uuid: string, visible: boolean): void {
		this.svg
			.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
			.attr('visibility', visible ? 'visible' : 'hidden');
	}

	/** Get compensated path for frequency response data */
	_getCompensatedPath(originalData: FRDataPoint[]): string | null {
		const bisect = d3.bisector<FRDataPoint, number>((point) => point[0]).left;
		const isBaselineValid =
			Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;

		const lineGenerator = d3
			.line<FRDataPoint>()
			.x((d) => this.xScale(d[0]))
			.y((d) => {
				if (!isBaselineValid) {
					return this.yScale(d[1]);
				}

				const channelData = this.baselineData.channelData!;
				const i = bisect(channelData, d[0], 0);
				const a = channelData[i - 1];
				const b = channelData[i];

				let baselineY = 0;
				if (a && b) {
					const t = (d[0] - a[0]) / (b[0] - a[0]);
					baselineY = a[1] + t * (b[1] - a[1]);
				} else if (a) {
					baselineY = a[1];
				} else if (b) {
					baselineY = b[1];
				}

				return this.yScale(d[1] - baselineY);
			})
			.curve(d3.curveMonotoneX);

		return lineGenerator(originalData);
	}

	/** Merge multiple per-channel envelopes into one by taking the widest spread
	 *  at each frequency index. Used when dispChannel covers more than one channel
	 *  (e.g. L+R) so the fill area reflects every underlying sample's extremes. */
	_combineHpTFEnvelopes(envelopes: HpTFEnvelope[]): HpTFEnvelope {
		const valid = envelopes.filter((e) => e?.upper.length && e?.lower.length);
		if (valid.length === 0) return { upper: [], lower: [] };
		if (valid.length === 1) return valid[0];
		const base = valid[0];
		const upper: FRDataPoint[] = base.upper.map(([freq], i) => {
			let max = -Infinity;
			for (const e of valid) {
				const v = e.upper[i]?.[1];
				if (v !== undefined && v > max) max = v;
			}
			return [freq, max] as FRDataPoint;
		});
		const lower: FRDataPoint[] = base.lower.map(([freq], i) => {
			let min = Infinity;
			for (const e of valid) {
				const v = e.lower[i]?.[1];
				if (v !== undefined && v < min) min = v;
			}
			return [freq, min] as FRDataPoint;
		});
		return { upper, lower };
	}

	/** Build closed SVG path for HpTF deviation envelope */
	_buildHpTFEnvelopePath(obj: FRDataObject): string | null {
		if (!obj.hptf) return null;

		// Fill envelope rules:
		//   dispChannel = ['L']         → envelope.L only
		//   dispChannel = ['R']         → envelope.R only
		//   dispChannel = ['AVG']       → combined L+R envelope (NOT envelope.AVG — that hides true spread)
		//   dispChannel = ['L','R'] etc → combined L+R envelope
		let pickChannels: ('L' | 'R' | 'AVG')[];
		const single = obj.dispChannel.length === 1 ? obj.dispChannel[0] : null;
		if (single === 'L') {
			pickChannels = ['L'];
		} else if (single === 'R') {
			pickChannels = ['R'];
		} else {
			const available: ('L' | 'R')[] = [];
			if (obj.hptf.envelope.L?.upper.length) available.push('L');
			if (obj.hptf.envelope.R?.upper.length) available.push('R');
			pickChannels =
				available.length > 0 ? available : obj.hptf.envelope.AVG?.upper.length ? ['AVG'] : [];
		}
		const envelope = this._combineHpTFEnvelopes(pickChannels.map((c) => obj.hptf!.envelope[c]));
		if (!envelope.upper.length) return null;

		const bisect = d3.bisector<FRDataPoint, number>((point) => point[0]).left;
		const isBaselineValid =
			Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;

		const computeY = (point: FRDataPoint): number => {
			if (!isBaselineValid) return this.yScale(point[1]);
			const channelData = this.baselineData.channelData!;
			const i = bisect(channelData, point[0], 0);
			const a = channelData[i - 1];
			const b = channelData[i];
			let baselineY = 0;
			if (a && b) {
				const t = (point[0] - a[0]) / (b[0] - a[0]);
				baselineY = a[1] + t * (b[1] - a[1]);
			} else if (a) baselineY = a[1];
			else if (b) baselineY = b[1];
			return this.yScale(point[1] - baselineY);
		};

		// Use curveMonotoneX instead of curveNatural to prevent overshoot —
		// the envelope represents strict min/max bounds and must not extend beyond data points.
		const lineGen = d3
			.line<FRDataPoint>()
			.x((d) => this.xScale(d[0]))
			.y((d) => computeY(d))
			.curve(d3.curveMonotoneX);

		const upperPath = lineGen(envelope.upper) ?? '';
		const lowerPath = lineGen([...envelope.lower].reverse()) ?? '';

		return upperPath + lowerPath.replace(/^M/, 'L') + 'Z';
	}

	/** Transition HpTF fill paths after scale or baseline changes */
	_transitionHpTFFillPaths(animate: boolean): void {
		// Use self alias to access GraphEngine instance inside attrTween
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this.curveGroup.selectAll<SVGPathElement, unknown>('path.fr-graph-hptf-fill').each(function () {
			const el = d3.select(this);
			el.interrupt(); // Cancel any in-progress transition to avoid stale path state
			const uuid = el.attr('uuid');
			if (!uuid) return;
			const obj = frStore.get(uuid);
			if (!obj) return;
			const newPath = self._buildHpTFEnvelopePath(obj);
			if (!newPath) return;
			if (animate) {
				const oldPath = el.attr('d') ?? '';
				// Only use string interpolation when paths have compatible structure
				// (same number of numeric values = same SVG command count).
				// Mismatched structures (e.g. after smoothing change) produce garbled paths.
				const oldCount = (oldPath.match(/-?\d+\.?\d*(e[+-]?\d+)?/gi) ?? []).length;
				const newCount = (newPath.match(/-?\d+\.?\d*(e[+-]?\d+)?/gi) ?? []).length;
				if (oldCount === newCount && oldCount > 0) {
					el.transition()
						.duration(self.transitionDuration)
						.attrTween('d', () => (t: number) => d3.interpolateString(oldPath, newPath)(t));
				} else {
					el.attr('d', newPath);
				}
			} else {
				el.attr('d', newPath);
			}
		});
	}

	/** Reposition all visible curves by recomputing path data with current yScale.
	 *  Lightweight: no DOM creation/removal, just d-attribute updates. */
	repositionCurves(): void {
		this.curveGroup
			.selectAll<
				SVGPathElement,
				FRDataPoint[]
			>("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)")
			.attr('d', (d) => this._getCompensatedPath(d));
		this._transitionHpTFFillPaths(false);
		this.eqOverlay?.render();
		this.preferenceBoundOverlay?.render();
	}

	getBaselineData(): BaselineData {
		return this.baselineData;
	}

	getYScale(): number {
		return this.yScaleValue;
	}

	getBaselineUUID(): string | null {
		return this.baselineData.uuid;
	}

	/** Apply a dB y-offset to all SVG paths for a given UUID */
	applyYOffset(uuid: string, yOffset: number): void {
		const pixelOffset = yOffset ? this.yScale(0) - this.yScale(yOffset) : 0;
		this.svg
			.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
			.attr('transform', pixelOffset !== 0 ? `translate(0, ${-pixelOffset})` : null);
	}

	/** Order overlay layers in the SVG */
	orderOverlayLayers(): void {
		this.svg.selectAll('.fr-graph-x-axis, .fr-graph-y-axis').lower();
		this.svg.selectAll('.fr-graph-spectrum-overlay').raise();
		this.svg.selectAll('.fr-graph-curve-container').raise();
		this.svg.selectAll('.x-grid-text, .x-grid-text-major, .y-grid-text').raise();
		this.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').raise();
		this.svg.selectAll('.fr-graph-eq-clip-wrapper').raise();
		this.svg.selectAll('.y-scaler-handle').raise();
	}

	/** Setup scales for the graph */
	_setupScales(): void {
		this.xScale = d3
			.scaleLog()
			.domain([20, 20000])
			.range([this.graphGeometry.xStart, this.graphGeometry.xEnd]);
		this.yScale = d3
			.scaleLinear()
			.domain([-(this.yScaleValue / 2), this.yScaleValue / 2])
			.range([this.graphGeometry.yBottom, this.graphGeometry.yTop]);
		this.baseYScale = this.yScale.copy();
	}

	getScales(): {
		xScale: d3.ScaleLogarithmic<number, number>;
		yScale: d3.ScaleLinear<number, number>;
	} {
		return { xScale: this.xScale, yScale: this.yScale };
	}

	/** Draw Y-axis (X-axis is Svelte-managed via GraphXAxis component) */
	_drawAxis(): void {
		if (this.svg.select('.fr-graph-y-axis').empty()) {
			this.svg.append('g').attr('class', 'fr-graph-y-axis').attr('transform', 'translate(0,0)');
		}

		this.updateYAxis();
	}

	/** Create curve group for frequency response curves */
	_createCurveGroup(): void {
		if (this.svg.select('.fr-graph-curve-container').empty()) {
			this.curveGroup = this.svg
				.append('g')
				.attr('class', 'fr-graph-curve-container')
				.attr('transform', 'translate(0,0)')
				.attr('fill', 'none')
				.attr('mask', 'url(#blur-fade-mask)');
		}
	}

	/** Draw FR Curve */
	drawFRCurve(uuid: string): void {
		this.eraseFRCurve(uuid);

		const object = frStore.get(uuid);
		if (!object) return;

		if (object.type === 'phone') {
			this._drawPhoneCurve(object);
		} else if (object.type === 'target') {
			this._drawTargetCurve(object);
		} else {
			this._drawUnknownCurve(object);
		}

		if (object.yOffset) {
			this.applyYOffset(uuid, object.yOffset);
		}
	}

	/** Draw Phone curve */
	_drawPhoneCurve(obj: FRDataObject): void {
		const channels = [...obj.dispChannel];
		const baseThickness = parseFloat(
			(getConfigValue('TRACE_STYLING.PHONE_TRACE_THICKNESS') as string) || '2'
		);
		const isEqSource = eqStore.isEnabled && obj.uuid === eqStore.sourcePhoneUUID;

		// Draw HpTF deviation fill (behind everything)
		if (obj.hptf && obj.hptfFillVisible) {
			const fillPath = this._buildHpTFEnvelopePath(obj);
			if (fillPath) {
				const baseAvg = obj.colors.AVG;
				const strokeOpacity = (getConfigValue('HPTF.FILL_OPACITY') as number) ?? 0.5;
				const fillOpacity = (getConfigValue('HPTF.FILL_OPACITY') as number) ?? 0.3;
				const toAlpha = (c: string, a: number) => {
					if (c.startsWith('oklch(')) return c.replace(/\)$/, ` / ${a})`);
					if (c.startsWith('hsl(')) return c.replace('hsl(', 'hsla(').replace(')', `, ${a})`);
					return c;
				};
				const color = toAlpha(baseAvg, strokeOpacity);
				const fillColor = toAlpha(baseAvg, fillOpacity);
				this.curveGroup
					.insert('path', ':first-child')
					.attr('class', 'fr-graph-phone-curve fr-graph-hptf-fill')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('identifier', obj.identifier)
					.attr('d', fillPath)
					.attr('fill', fillColor)
					.attr('stroke', color)
					.attr('stroke-width', String(baseThickness / 2))
					.attr('opacity', isEqSource ? 0.35 : null)
					.style('pointer-events', 'none');
			}
		}

		// Draw individual HpTF sample curves
		if (obj.hptf && obj.dispHptf?.length) {
			for (const key of obj.dispHptf) {
				const match = key.match(/^sample(\d+)_(L|R|AVG)$/);
				if (!match) continue;
				const sampleIndex = parseInt(match[1]);
				const channel = match[2] as 'L' | 'R' | 'AVG';
				const hptfSample = obj.hptf.samples[sampleIndex];
				if (!hptfSample?.[channel]) continue;

				const color = obj.colors.AVG;

				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(hptfSample[channel]!.data, graphStore.smoothValue))
					.attr('class', 'fr-graph-phone-curve fr-graph-hptf-sample-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', key)
					.attr('hptf-sample', 'true')
					.attr('identifier', obj.identifier)
					.attr('stroke', color)
					.attr('stroke-width', String(baseThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('opacity', isEqSource ? 0.35 : null)
					.attr('d', (d) => this._getCompensatedPath(d));
			}
		}

		// Draw HpTF average curve (mean of all samples, when hptfOnly)
		if (obj.hptfOnly && obj.hptfAvgVisible) {
			channels.forEach((channel) => {
				if (!obj.channels[channel]) return;
				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(obj.channels[channel]!.data, graphStore.smoothValue))
					.attr('class', 'fr-graph-phone-curve fr-graph-hptf-avg-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', channel)
					.attr('hptf-avg', 'true')
					.attr('identifier', obj.identifier)
					.attr('stroke', `${obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors['AVG']}`)
					.attr('stroke-width', String(baseThickness))
					.attr('opacity', isEqSource ? 0.35 : null)
					.attr('d', (d) => this._getCompensatedPath(d));
			});
		}

		// Draw main channels (skip if hptfOnly)
		if (!obj.hptfOnly) {
			channels.forEach((channel) => {
				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(obj.channels[channel]!.data, graphStore.smoothValue))
					.attr('class', 'fr-graph-phone-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', channel)
					.attr('identifier', obj.identifier)
					.attr('stroke', `${obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors['AVG']}`)
					.attr('stroke-width', String(baseThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('opacity', isEqSource ? 0.35 : null)
					.attr('d', (d) => this._getCompensatedPath(d));
			});
		}

		// Draw sample traces (thin + transparent)
		if (obj.samples && obj.dispSamples?.length) {
			const sampleThickness = baseThickness * 0.6;

			for (const key of obj.dispSamples) {
				const match = key.match(/^([LR])(\d+)$/);
				if (!match) continue;
				const side = match[1] as 'L' | 'R';
				const sampleIndex = parseInt(match[2]) - 1;
				const sample = obj.samples[sampleIndex];
				if (!sample?.[side]) continue;

				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(sample[side]!.data, graphStore.smoothValue))
					.attr('class', 'fr-graph-phone-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', key)
					.attr('sample', 'true')
					.attr('identifier', obj.identifier)
					.attr('stroke', 'var(--color-base-content)')
					.attr('stroke-width', String(sampleThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('opacity', '0.35')
					.attr('d', (d) => this._getCompensatedPath(d));
			}
		}
	}

	/** Draw Target curve */
	_drawTargetCurve(obj: FRDataObject): void {
		this.curveGroup
			.append('path')
			.datum(obj.channels['AVG']!.data)
			.attr('class', 'fr-graph-target-curve')
			.attr('uuid', obj.uuid)
			.attr('type', obj.type)
			.attr('identifier', obj.identifier)
			.attr('stroke', `${obj.colors['AVG'] || 'var(--color-base-content)'}`)
			.attr(
				'stroke-width',
				(getConfigValue('TRACE_STYLING.TARGET_TRACE_THICKNESS') as string) || '1'
			)
			.attr('stroke-dasharray', obj.dash || '4 4')
			.attr('d', (d) => this._getCompensatedPath(d));
	}

	/** Draw Unknown curve */
	_drawUnknownCurve(obj: FRDataObject): void {
		const channels = [...obj.dispChannel];

		channels.forEach((channel) => {
			this.curveGroup
				.append('path')
				.datum(() => FRSmoother.smooth(obj.channels[channel]!.data, graphStore.smoothValue))
				.attr('class', `fr-graph-${obj.type}-curve`)
				.attr('uuid', obj.uuid)
				.attr('type', obj.type)
				.attr('channel', channel)
				.attr('identifier', obj.identifier)
				.attr('stroke', `${obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors['AVG']}`)
				.attr(
					'stroke-width',
					obj.type === 'inserted-target'
						? (getConfigValue('TRACE_STYLING.TARGET_TRACE_THICKNESS') as string) || '1'
						: (getConfigValue('TRACE_STYLING.PHONE_TRACE_THICKNESS') as string) || '2'
				)
				.attr('stroke-dasharray', obj.dash || '1 0')
				.attr('d', (d) => this._getCompensatedPath(d));
		});
	}

	/** Erase FR Curve */
	eraseFRCurve(uuid: string): void {
		this.curveGroup.selectAll(`*[uuid="${uuid}"]`).remove();
	}

	/** Update Y Axis of the graph */
	updateYAxis(oldYScale: d3.ScaleLinear<number, number> | null = null, transition = true): void {
		const yScale = this.yScale;
		const tickValues =
			this.yScaleValue < 50 ? yScale.ticks(this.yScaleValue) : yScale.ticks(this.yScaleValue / 5);

		const axis = this.svg.select<SVGGElement>('.fr-graph-y-axis');
		const gridGroups = axis
			.selectAll<SVGGElement, number>('.y-grid-group')
			.data(tickValues, (d) => d);

		gridGroups
			.exit()
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 0)
			.remove();

		const enterGroups = gridGroups
			.enter()
			.append('g')
			.attr('class', 'y-grid-group')
			.attr('y', (d) => d)
			.style('opacity', 0);

		this._createYAxisElements(enterGroups, oldYScale || yScale);

		const allGroups = enterGroups.merge(gridGroups);

		allGroups
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 1);

		allGroups
			.selectAll<SVGLineElement, number>('.y-grid-line, .y-grid-line-major')
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.attr('y1', (d) => yScale(d))
			.attr('y2', (d) => yScale(d));

		allGroups
			.selectAll<SVGTextElement, number>('.y-grid-text')
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.attr('y', (d) => yScale(d));

		let dbText = axis.select<SVGTextElement>('.y-grid-db-text');
		if (dbText.empty()) {
			dbText = axis
				.append('text')
				.attr('class', 'y-grid-db-text')
				.attr('transform', 'rotate(-90)')
				.text('dB');
		}

		dbText
			.attr('x', -31)
			.attr('y', 15)
			.attr('dx', 4)
			.attr('dy', -4)
			.attr('font-size', '0.6rem')
			.attr('font-weight', '400')
			.attr('text-anchor', 'start')
			.attr('fill', 'var(--color-graph-grid-text)');

		this.orderOverlayLayers();
	}

	/** Create Y Axis elements (lines and text) */
	_createYAxisElements(
		selection: d3.Selection<SVGGElement, number, SVGGElement, unknown>,
		scale: d3.ScaleLinear<number, number>
	): void {
		selection
			.append('line')
			.attr('class', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 'y-grid-line' : 'y-grid-line-major';
			})
			.attr('x1', this.graphGeometry.xStart)
			.attr('x2', this.graphGeometry.xEnd)
			.attr('y1', (d) => scale(d))
			.attr('y2', (d) => scale(d))
			.attr('stroke', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 'var(--color-graph-grid-major)' : 'var(--color-graph-grid-minor)';
			})
			.attr('stroke-width', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 1 : 0.7;
			});

		selection.each((d, i, nodes) => {
			const isMajor = d % 10 === 0;
			if (isMajor) {
				d3.select(nodes[i])
					.append('text')
					.attr('class', 'y-grid-text')
					.attr('x', this.graphGeometry.xStart)
					.attr('y', scale(d))
					.attr('dx', 4)
					.attr('dy', -4)
					.attr('font-size', '0.6rem')
					.attr('font-weight', '400')
					.attr('text-anchor', 'start')
					.attr('fill', 'var(--color-graph-grid-text)')
					.text(d);
			}
		});
	}

	/** Draw fade gradient mask for the graph */
	_drawFadeGradient(): void {
		const defs = this.svg.append('defs');
		const ix = 20;
		const iy = 20;

		defs
			.append('mask')
			.attr('id', 'blur-fade-mask')
			.append('rect')
			.attr('x', ix)
			.attr('y', iy)
			.attr('width', this.viewBoxWidth - 2 * ix)
			.attr('height', this.viewBoxHeight - 2 * iy)
			.attr('fill', 'white')
			.attr('filter', 'blur(5px)');
	}

	/** Handle channel update for frequency response curves */
	channelUpdateRunner(uuid: string, type: string): void {
		this.curveGroup.selectAll(`.fr-graph-${type}-curve[uuid="${uuid}"]`).remove();
		const frData = frStore.get(uuid);
		if (!frData) return;
		if (type === 'phone') {
			this._drawPhoneCurve(frData);
		} else {
			this._drawUnknownCurve(frData);
		}
	}
}

export type { GraphEngine };
export const graphEngine = new GraphEngine();
