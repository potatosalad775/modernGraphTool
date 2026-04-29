import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { audioRangeStore } from '$lib/stores/audio-range-store.svelte.js';

/**
 * GraphSoundRangeOverlay — renders a translucent band on the FR graph showing
 * the active listening range, and accepts click-and-drag to redraw it. Active
 * only when `audioRangeStore.isFrequencySelectionMode` is true. While active,
 * a transparent click-rect intercepts pointer events from `GraphEqOverlay`
 * so EQ-node-drag and click-to-add are temporarily disabled.
 */
export class GraphSoundRangeOverlay {
	private graphEngine: GraphEngine;
	private clipWrapper!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private bandRect!: d3.Selection<SVGRectElement, unknown, null, undefined>;
	private modeBadge!: d3.Selection<SVGTextElement, unknown, null, undefined>;
	private clickRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
	private _active = false;

	private static readonly CLIP_ID = 'sound-range-overlay-clip';
	// Click vs drag threshold (pixels). Below this, a press-release leaves the
	// existing range untouched (treats it as a stray click).
	private static readonly CLICK_DRAG_THRESHOLD = 3;

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this._createGroups();
	}

	destroy(): void {
		this._removeClickRect();
		this.clipWrapper.remove();
		this.graphEngine.svg.select(`#${GraphSoundRangeOverlay.CLIP_ID}`).remove();
	}

	// ── SVG setup ──────────────────────────────────────────────────────────────

	private _createGroups(): void {
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;

		this.graphEngine.svg
			.select<SVGDefsElement>('defs')
			.append('clipPath')
			.attr('id', GraphSoundRangeOverlay.CLIP_ID)
			.append('rect')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop);

		this.clipWrapper = this.graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-sound-range-clip-wrapper')
			.attr('clip-path', `url(#${GraphSoundRangeOverlay.CLIP_ID})`);

		this.overlayGroup = this.clipWrapper.append('g').attr('class', 'fr-graph-sound-range-overlay');

		// Band rect — visible when active, hidden otherwise. Translucent fill
		// over the active range so it reads as a "selection band" rather than
		// a hard block.
		this.bandRect = this.overlayGroup
			.append('rect')
			.attr('class', 'fr-graph-sound-range-band')
			.attr('y', yTop)
			.attr('height', yBottom - yTop)
			.attr('fill', 'var(--color-accent)')
			.attr('opacity', 0)
			.attr('pointer-events', 'none');

		// Mode badge — top-right corner label shown while range mode is active.
		this.modeBadge = this.overlayGroup
			.append('text')
			.attr('class', 'fr-graph-sound-range-badge')
			.attr('x', xEnd - 6)
			.attr('y', yTop + 14)
			.attr('text-anchor', 'end')
			.attr('font-size', '10px')
			.attr('font-weight', '500')
			.attr('fill', 'var(--color-accent)')
			.attr('opacity', 0)
			.attr('pointer-events', 'none')
			.text('FREQ RANGE');

		this.graphEngine.orderOverlayLayers();
	}

	// ── Public API ─────────────────────────────────────────────────────────────

	setActive(active: boolean): void {
		if (active === this._active) return;
		this._active = active;
		if (active) this._addClickRect();
		else this._removeClickRect();
		this.render();
	}

	render(): void {
		if (!this._active) {
			this.bandRect.attr('opacity', 0);
			this.modeBadge.attr('opacity', 0);
			return;
		}
		const xs = this.graphEngine.xScale;
		const x1 = xs(audioRangeStore.fromHz);
		const x2 = xs(audioRangeStore.toHz);
		this.bandRect
			.attr('x', Math.min(x1, x2))
			.attr('width', Math.max(2, Math.abs(x2 - x1)))
			.attr('opacity', 0.18);
		this.modeBadge.attr('opacity', 0.7);
	}

	// ── Drag-to-set ────────────────────────────────────────────────────────────

	private _addClickRect(): void {
		if (this.clickRect) return;
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;

		this.clickRect = this.overlayGroup
			.insert('rect', ':first-child')
			.attr('class', 'fr-graph-sound-range-click')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop)
			.attr('fill', 'transparent')
			.style('cursor', 'crosshair')
			.call(this._buildDrag());

		this.graphEngine.orderOverlayLayers();
	}

	private _removeClickRect(): void {
		if (!this.clickRect) return;
		this.clickRect.remove();
		this.clickRect = null;
	}

	private _buildDrag() {
		let startX = 0;
		const xs = () => this.graphEngine.xScale;
		return d3
			.drag<SVGRectElement, unknown>()
			.on('start', (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
				startX = event.x;
			})
			.on('drag', (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
				const a = xs().invert(startX);
				const b = xs().invert(event.x);
				audioRangeStore.setRange(a, b);
				this.render();
			})
			.on('end', (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
				if (Math.abs(event.x - startX) < GraphSoundRangeOverlay.CLICK_DRAG_THRESHOLD) {
					// Stray click — leave existing range unchanged.
					return;
				}
				const a = xs().invert(startX);
				const b = xs().invert(event.x);
				audioRangeStore.setRange(a, b);
				this.render();
			});
	}
}
