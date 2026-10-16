import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import type { FRDataPoint } from '#lib/types/data-types.js';

export interface CompareGhostState {
	visible: boolean;
	/** The side being ghosted, drawn beside the trace. English, like every graph label. */
	label: string | null;
	/** One already-processed curve per displayed channel. */
	curves: FRDataPoint[][];
	/** dB offset of the live EQ curve, so the ghost moves with it. */
	yOffset: number;
	baselineChannelData: FRDataPoint[] | null;
}

/** Public surface the engine + GraphContainer depend on. */
export interface CompareOverlayApi {
	update(state: CompareGhostState): void;
	render(): void;
	clear(): void;
}

/**
 * GraphCompareOverlay — the History & Compare "ghost": while A and B are both
 * picked, the side that isn't live is drawn as a faint dashed trace, so a
 * switch can be judged against the curve it replaced.
 *
 * Nothing goes into `frStore` — the ghost is not a device, has no list row and
 * no undo. GraphContainer builds the curves (`dataProvider.eqChannelsFor`, the
 * same math as the live EQ curve) and pushes them in. render() recomputes the
 * paths against the engine's *current* scales and the baseline, so a handle
 * drag (GraphEngine.repositionCurves) repaints it in step with the real curves.
 *
 * Color comes from `--color-graph-compare` (theme.css), falling back to the
 * axis-label token for themes written before it existed.
 */
export class GraphCompareOverlay implements CompareOverlayApi {
	private graphEngine: GraphEngine;

	private state: CompareGhostState = {
		visible: false,
		label: null,
		curves: [],
		yOffset: 0,
		baselineChannelData: null
	};

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
	}

	update(state: CompareGhostState): void {
		this.state = state;
		this.render();
	}

	render(): void {
		if (!this.graphEngine.curveGroup) return;
		const { visible, curves } = this.state;
		if (!visible || curves.length === 0) {
			this._remove();
			return;
		}
		this._draw();
	}

	clear(): void {
		this.state.visible = false;
		this._remove();
	}

	destroy(): void {
		this._remove();
	}

	private _interpolateAt(data: FRDataPoint[], freq: number): number {
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

	/** The dB drawn at `point`: its own value, baseline-compensated and offset like the EQ curve. */
	private _y(point: FRDataPoint): number {
		const { baselineChannelData, yOffset } = this.state;
		const baseline =
			baselineChannelData && baselineChannelData.length > 0
				? this._interpolateAt(baselineChannelData, point[0])
				: 0;
		return point[1] - baseline + yOffset;
	}

	private _draw(): void {
		const { xScale, yScale } = this.graphEngine;
		const { curves, label } = this.state;

		let group = this.graphEngine.curveGroup.select<SVGGElement>('g.fr-graph-compare-ghost');
		if (group.empty()) {
			group = this.graphEngine.curveGroup
				.append('g')
				.attr('class', 'fr-graph-compare-ghost')
				.style('pointer-events', 'none');
		}

		const line = d3
			.line<FRDataPoint>()
			.x((d) => xScale(d[0]))
			.y((d) => yScale(this._y(d)))
			.curve(d3.curveMonotoneX);

		group
			.selectAll<SVGPathElement, FRDataPoint[]>('path')
			.data(curves)
			.join('path')
			.attr('d', (d) => line(d) ?? '')
			.attr('fill', 'none')
			.style('stroke', 'var(--color-graph-compare, var(--color-graph-axis-label))')
			.attr('stroke-width', 1.5)
			.attr('stroke-dasharray', '6 4');

		// The label sits just above the trace's right end.
		const last = curves[0].at(-1);
		const text = group
			.selectAll<SVGTextElement, string>('text')
			.data(label && last ? [label] : [])
			.join('text')
			.text((d) => d)
			.attr('text-anchor', 'end')
			.attr('font-size', 12)
			.attr('font-weight', 600)
			.style('fill', 'var(--color-graph-compare, var(--color-graph-axis-label))');
		if (last) text.attr('x', xScale(last[0]) - 4).attr('y', yScale(this._y(last)) - 6);
	}

	private _remove(): void {
		const el = this.graphEngine.curveGroup?.select('g.fr-graph-compare-ghost');
		if (el && !el.empty()) el.remove();
	}
}
