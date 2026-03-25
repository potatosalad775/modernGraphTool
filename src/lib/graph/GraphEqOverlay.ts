import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';

interface BandDatum {
	filter: EQFilter;
	index: number;
}

/**
 * GraphEqOverlay — renders interactive EQ band nodes on the graph SVG.
 *
 * This is a "dumb" D3 class: GraphContainer.svelte drives re-renders by
 * calling render() inside $effect blocks whenever eqStore.filters or
 * graphStore.yScale change.
 *
 * Interaction model:
 *   - Drag horizontal  → adjust frequency
 *   - Drag vertical    → adjust gain
 *   - Scroll on node   → adjust Q (±0.1 per tick, clamped [0.1, 10])
 *   - Double-click     → remove band
 *   - Click empty area → add new PK band (only when EQ panel active)
 */
export class GraphEqOverlay {
	private graphEngine: GraphEngine;
	private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private clickRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
	private _eqPanelActive = false;
	private _dragThrottleTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();

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
		// Hide all nodes when EQ is globally disabled
		if (!eqStore.isEnabled) {
			this.overlayGroup.selectAll('.eq-band-node').remove();
			return;
		}

		const { xScale, yScale } = this.graphEngine.getScales();
		const filters = eqStore.filters;
		const data: BandDatum[] = filters
			.map((filter, index) => ({ filter, index }))
			.filter((d) => d.filter.enabled && d.filter.freq != null && d.filter.gain != null);

		// D3 data join on .eq-band-node groups
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
			.attr('stroke', 'var(--gt-color-primary)')
			.attr('stroke-width', 1.5)
			.attr('opacity', 0.5);

		// Center dot
		entered
			.append('circle')
			.attr('class', 'eq-center-dot')
			.attr('r', 6)
			.attr('fill', 'var(--gt-color-primary)')
			.attr('opacity', 0.9);

		// Freq label
		entered
			.append('text')
			.attr('class', 'eq-freq-label')
			.attr('text-anchor', 'middle')
			.attr('dy', '-10')
			.attr('font-size', '10px')
			.attr('fill', 'var(--gt-color-on-surface)')
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
			const x = xScale(Math.max(20, Math.min(20000, d.filter.freq!)));
			const y = yScale(Math.max(-40, Math.min(40, d.filter.gain!)));
			return `translate(${x},${y})`;
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

	// ── Drag behavior ──────────────────────────────────────────────────────────

	private _buildDragBehavior() {
		return d3
			.drag<SVGGElement, BandDatum>()
			.on('start', function () {
				d3.select(this).style('cursor', 'grabbing').raise();
			})
			.on('drag', (event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				const { xScale: xs, yScale: ys } = this.graphEngine.getScales();
				const freq = Math.max(20, Math.min(20000, xs.invert(event.x)));
				const gain = Math.max(-40, Math.min(40, ys.invert(event.y)));

				// Move node visually with zero latency
				this.overlayGroup
					.selectAll<SVGGElement, BandDatum>('.eq-band-node')
					.filter((n) => n.index === d.index)
					.attr('transform', `translate(${xs(freq)},${ys(gain)})`);

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
					const gain = Math.max(-40, Math.min(40, ys.invert(event.y)));

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
				}
			);
	}

	// ── Click-to-add ───────────────────────────────────────────────────────────

	private _updateClickRect(): void {
		if (this._eqPanelActive) {
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
				if (!eqStore.isEnabled) return;
				// Don't fire when clicking on a node
				if ((event.target as Element).closest?.('.eq-band-node')) return;
				const { xScale, yScale } = this.graphEngine.getScales();
				const [mx, my] = d3.pointer(event);
				const freq = Math.round(Math.max(20, Math.min(20000, xScale.invert(mx))));
				const gain = parseFloat(
					Math.max(-40, Math.min(40, yScale.invert(my))).toFixed(1)
				);
				eqStore.addBand({ enabled: true, type: 'PK', freq, q: 1.0, gain });
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
