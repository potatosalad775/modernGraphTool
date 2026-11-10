import * as d3 from 'd3';
import { untrack } from 'svelte';
import {
	isTargetType,
	type FRDataObject,
	type FRDataPoint,
	type SampleEnvelope
} from '#lib/types/data-types.js';
import GraphHandle from './GraphHandle.js';
import GraphInspection from './GraphInspection.js';
import { getConfigValue } from '#lib/utils/config.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { sampleFillOpacity } from '#lib/utils/sample-config.js';
import { baseline, compensateAt } from './baseline.js';
import { combineEnvelopes, curveTraces, selectEnvelope } from './curve-traces.js';
import { eqSourceContextFor } from './eq-source-context.js';
import type { PreferenceBoundOverlayApi } from './GraphPreferenceBoundOverlay.js';
import type { CompareOverlayApi } from './GraphCompareOverlay.js';

class GraphEngine {
	// ── Property declarations ──────────────────────────────────────────────────
	viewBoxWidth: number;
	viewBoxHeight: number;
	graphGeometry: { xStart: number; xEnd: number; yTop: number; yBottom: number };
	labelPosition: Record<
		string,
		{ x: number; y: number; anchor: string; growUp: boolean; style?: string }
	>;
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
	/** Preference-bound overlay reference — set by GraphContainer. `$state` so effects that
	 *  push into it re-run once this is assigned (cf. `eqOverlay`, which is not reactive). */
	preferenceBoundOverlay = $state<PreferenceBoundOverlayApi | null>(null);
	/** History & Compare ghost trace — set by GraphContainer, `$state` for the same reason. */
	compareOverlay = $state<CompareOverlayApi | null>(null);
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
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-sample-fill)")
			.interrupt()
			.transition()
			.duration(this.transitionDuration)
			.attr('d', (d) => this._getCompensatedPath(d as FRDataPoint[]));

		this._transitionFillPaths(true);
	}

	/**
	 * Move the drawn curves to the baseline now in effect. The baseline itself is
	 * `baseline` (baseline.ts); this only re-draws paths against it.
	 */
	updateBaseline(animate = false): void {
		// Use self alias to access GraphEngine instance inside attrTween
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this.curveGroup
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-sample-fill)")
			.interrupt()
			.transition()
			.duration(animate ? this.transitionDuration : 0)
			.attrTween('d', function (d) {
				const path = d3.select(this as Element);
				const oldPath = path.attr('d') ?? '';
				const newPath = self._getCompensatedPath(d as FRDataPoint[]) ?? '';
				return (t) => d3.interpolateString(oldPath, newPath)(t);
			});

		this._transitionFillPaths(animate);
	}

	/** Update visibility of curves */
	updateVisibility(uuid: string, visible: boolean): void {
		this.svg
			.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
			.attr('visibility', visible ? 'visible' : 'hidden');
	}

	/**
	 * What to subtract from a path. Untracked: the engine is imperative, and some of
	 * its callers run inside an effect (the y-scale one) that must not start
	 * depending on the baseline. `GraphContainer` owns the effect that reacts to it.
	 */
	private _baselineData() {
		return untrack(() => baseline.channelData);
	}

	/** Get compensated path for frequency response data */
	_getCompensatedPath(originalData: FRDataPoint[]): string | null {
		const baselineData = this._baselineData();
		const lineGenerator = d3
			.line<FRDataPoint>()
			.x((d) => this.xScale(d[0]))
			.y((d) => this.yScale(compensateAt(d[1], d[0], baselineData)))
			.curve(d3.curveMonotoneX);

		return lineGenerator(originalData);
	}

	/** Merge several per-channel envelopes into one (the widest spread at each index). */
	_combineEnvelopes(envelopes: SampleEnvelope[]): SampleEnvelope {
		return combineEnvelopes(envelopes);
	}

	/** Build closed SVG path for a sample set's min/max envelope */
	_buildEnvelopePath(obj: FRDataObject): string | null {
		return this._envelopePath(selectEnvelope(obj));
	}

	/** Closed SVG path for one envelope, baseline-compensated; null when it is empty. */
	_envelopePath(envelope: SampleEnvelope): string | null {
		if (!envelope.upper.length) return null;

		const baselineData = this._baselineData();
		const computeY = (point: FRDataPoint): number =>
			this.yScale(compensateAt(point[1], point[0], baselineData));

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

	/** Transition sample fill paths after scale or baseline changes */
	_transitionFillPaths(animate: boolean): void {
		// Use self alias to access GraphEngine instance inside attrTween
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this;
		this.curveGroup
			.selectAll<SVGPathElement, unknown>('path.fr-graph-sample-fill')
			.each(function () {
				const el = d3.select(this);
				el.interrupt(); // Cancel any in-progress transition to avoid stale path state
				const uuid = el.attr('uuid');
				if (!uuid) return;
				const obj = frStore.get(uuid);
				if (!obj) return;
				const newPath = self._buildEnvelopePath(obj);
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
			.selectAll<SVGPathElement, FRDataPoint[]>(
				"path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-sample-fill)"
			)
			.attr('d', (d) => this._getCompensatedPath(d));
		this._transitionFillPaths(false);
		this.eqOverlay?.render();
		this.preferenceBoundOverlay?.render();
		this.compareOverlay?.render();
	}

	getYScale(): number {
		return this.yScaleValue;
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
		this.svg.selectAll('.fr-graph-sound-range-clip-wrapper').raise();
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

		this._drawTraces(object);

		if (object.yOffset) {
			this.applyYOffset(uuid, object.yOffset);
		}
	}

	/**
	 * Draw whatever `curveTraces` says the item puts on the graph; labels and the
	 * hover readout read the same list. Channels and runs are stored already
	 * smoothed at `graphStore.smoothValue` (`reSmoothAll` rebuilds them when it
	 * changes), so paths bind them as-is.
	 */
	_drawTraces(obj: FRDataObject): void {
		const isTarget = isTargetType(obj);
		const phoneThickness = (getConfigValue('TRACE_STYLING.PHONE_TRACE_THICKNESS') as string) || '2';
		const baseThickness = parseFloat(phoneThickness);
		const mainThickness = isTarget
			? (getConfigValue('TRACE_STYLING.TARGET_TRACE_THICKNESS') as string) || '1'
			: phoneThickness;
		const itemClass = `fr-graph-${obj.type}-curve`;

		for (const trace of curveTraces(obj, eqSourceContextFor(obj))) {
			if (trace.kind === 'fill') {
				const fillPath = this._envelopePath(trace.envelope);
				if (!fillPath) continue;
				// Transparency goes through `fill-opacity` / `stroke-opacity` rather than
				// being folded into the color string. Rewriting the color only worked for
				// the `oklch()` and `hsl()` notations — a hex from CURVE_COLOR_PALETTE fell
				// through unchanged and the band drew fully opaque, hiding the curves it
				// is supposed to sit behind.
				const opacity = sampleFillOpacity();
				this.curveGroup
					.insert('path', ':first-child')
					.attr('class', `${itemClass} fr-graph-sample-fill`)
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('identifier', obj.identifier)
					.attr('d', fillPath)
					.attr('fill', trace.color)
					.attr('fill-opacity', String(opacity))
					.attr('stroke', trace.color)
					.attr('stroke-opacity', String(opacity))
					.attr('stroke-width', String(baseThickness / 2))
					.attr('opacity', trace.ghost ? 0.35 : null)
					.style('pointer-events', 'none');
				continue;
			}

			const isRun = trace.kind === 'run';
			this.curveGroup
				.append('path')
				.datum(trace.data)
				.attr('class', isRun ? `${itemClass} fr-graph-sample-curve` : itemClass)
				.attr('uuid', obj.uuid)
				.attr('type', obj.type)
				.attr('channel', trace.key)
				.attr('sample', isRun ? 'true' : null)
				.attr('identifier', obj.identifier)
				.attr('stroke', trace.color)
				.attr('stroke-width', isRun ? String(baseThickness * 0.6) : mainThickness)
				.attr('stroke-dasharray', obj.dash || (obj.type === 'target' ? '4 4' : '1 0'))
				.attr('opacity', isRun ? '0.5' : trace.ghost ? 0.35 : null)
				.attr('d', (d) => this._getCompensatedPath(d));
		}
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
		this._drawTraces(frData);
	}
}

export type { GraphEngine };
export const graphEngine = new GraphEngine();
