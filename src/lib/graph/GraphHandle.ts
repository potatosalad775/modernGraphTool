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
			.attr('transform', `translate(${this.graphEngine.graphGeometry.xEnd},0)`);

		this.handle = this.handleGroup
			.append('circle')
			.attr('r', this.handleRadius)
			.attr('stroke', 'var(--color-primary)')
			.attr('stroke-width', 2)
			.attr('fill', 'var(--color-base-300)')
			.attr('opacity', '0.4')
			.attr('cursor', 'pointer')
			.attr('cy', (this.graphEngine.graphGeometry.yTop + this.graphEngine.graphGeometry.yBottom) / 2);

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
				this.handle.attr('cy', newY);

				const normalizedPosition = (newY - this.centerY) / (this.maxY - this.centerY);
				this.yShift = this.maxShift * normalizedPosition;

				this._updateGraphPosition();
			})
			.on('end', () => {
				this.handle.attr('opacity', '0.4');
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

		this.graphEngine.updateYAxis(null, false);

		this.graphEngine.curveGroup.attr(
			'transform',
			`translate(0, ${this.yShift * ((this.graphEngine.graphGeometry.yBottom - this.graphEngine.graphGeometry.yTop) / this.graphEngine.yScaleValue)})`
		);
	}

	resetHandle() {
		this.handle.transition().duration(0).attr('cy', this.centerY);
		this.yShift = 0;
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
