import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';

class GraphHandle {
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	graphEngine: GraphEngine;
	yShift: number;
	maxShift: number;
	isMobile: boolean;
	handleRadius: number;
	handleGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	handle!: d3.Selection<SVGCircleElement, unknown, null, undefined>;
	minY = 0;
	maxY = 0;
	centerY = 0;
	private _frame: number | null = null;

	constructor(
		svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
		graphEngine: GraphEngine,
		isMobile: boolean
	) {
		this.svg = svg;
		this.graphEngine = graphEngine;
		this.yShift = 0;
		this.maxShift = 20;
		this.isMobile = isMobile;
		this.handleRadius = isMobile ? 20 : 10;

		this._initHandle();
		this._setupDragBehavior();
		this._attachEventListeners();
	}

	_initHandle() {
		this.handleGroup = this.svg
			.append('g')
			.attr('class', 'y-scaler-handle')
			.attr('data-tutorial-target', 'graph_handle')
			.attr('transform', `translate(${this.graphEngine.graphGeometry.xEnd},0)`);

		this.handle = this.handleGroup
			.append('circle')
			.attr('r', this.handleRadius)
			.attr('stroke', 'var(--color-primary)')
			.attr('stroke-width', 2)
			.attr('fill', 'var(--color-base-300)')
			.attr('opacity', '0.4')
			.attr('cursor', 'pointer')
			.attr(
				'cy',
				(this.graphEngine.graphGeometry.yTop + this.graphEngine.graphGeometry.yBottom) / 2
			);

		this.minY = this.graphEngine.graphGeometry.yTop + this.handleRadius;
		this.maxY = this.graphEngine.graphGeometry.yBottom - this.handleRadius;
		this.centerY = (this.minY + this.maxY) / 2;
	}

	_setupDragBehavior() {
		const drag = d3
			.drag()
			.on('start', () => {
				this.handle.attr('opacity', '1');
			})
			.on('drag', (event) => {
				const newY = Math.max(this.minY, Math.min(this.maxY, event.y));
				// The handle itself follows the pointer at once; the redraw of every
				// curve, grid line and overlay waits for the frame and reads `yShift`
				// then, so a burst of events costs one redraw and the last one wins.
				this.handle.attr('cy', newY);

				const normalizedPosition = (newY - this.centerY) / (this.maxY - this.centerY);
				this.yShift = this.maxShift * normalizedPosition;

				this._scheduleRedraw();
			})
			.on('end', () => {
				this.handle.attr('opacity', '0.4');
				// The release position is always drawn, not left for a frame that a
				// teardown or a background tab might never deliver.
				this._flushRedraw();
			});

		this.handle.call(
			drag as unknown as (
				selection: d3.Selection<SVGCircleElement, unknown, null, undefined>
			) => void
		);
	}

	_updateGraphPosition() {
		this.graphEngine.yScale = d3
			.scaleLinear()
			.domain([
				-(this.graphEngine.yScaleValue / 2) + this.yShift,
				this.graphEngine.yScaleValue / 2 + this.yShift
			])
			.range([this.graphEngine.graphGeometry.yBottom, this.graphEngine.graphGeometry.yTop]);

		this.graphEngine.baseYScale = this.graphEngine.yScale.copy();
		this.graphEngine.updateYAxis(null, false);
		this.graphEngine.repositionCurves();
	}

	/** Draw the current `yShift` in the next animation frame; one request covers a burst. */
	private _scheduleRedraw() {
		if (this._frame !== null) return;
		this._frame = requestAnimationFrame(() => {
			this._frame = null;
			this._updateGraphPosition();
		});
	}

	/** Draw now if a frame is pending, and drop that frame. */
	private _flushRedraw() {
		if (this._frame === null) return;
		cancelAnimationFrame(this._frame);
		this._frame = null;
		this._updateGraphPosition();
	}

	resetHandle() {
		// No `.transition().duration(0)`: even a zero-length transition defers its
		// write to the next tick. `interrupt()` keeps the old guarantee that nothing
		// already in flight overwrites this position afterwards.
		this.handle.interrupt().attr('cy', this.centerY);
		this.yShift = 0;
		// A drag frame still pending would redraw the same state a second time.
		if (this._frame !== null) {
			cancelAnimationFrame(this._frame);
			this._frame = null;
		}
		this._updateGraphPosition();
	}

	/** Called by GraphContainer when appStore.isMobile changes */
	setMobile(isMobile: boolean) {
		this.isMobile = isMobile;
		this.handleRadius = isMobile ? 20 : 10;
		this.handle.attr('r', this.handleRadius);
		this.minY = this.graphEngine.graphGeometry.yTop + this.handleRadius;
		this.maxY = this.graphEngine.graphGeometry.yBottom - this.handleRadius;
		this.centerY = (this.minY + this.maxY) / 2;
		if (this.yShift === 0) {
			this.handle.attr('cy', this.centerY);
		}
	}

	_attachEventListeners() {
		this.handle.on('dblclick touchstart', (event) => {
			if (event.type === 'touchstart') {
				const lastTouch = (this.handle.property('lastTouch') as number) || 0;
				const currentTime = new Date().getTime();
				if (currentTime - lastTouch <= 300) {
					event.preventDefault();
					this.resetHandle();
					this.handle.property('lastTouch', 0);
				} else {
					this.handle.property('lastTouch', currentTime);
				}
			} else {
				this.resetHandle();
			}
		});
	}
}

export default GraphHandle;
