import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import type { ChannelData, FRDataPoint } from '#lib/types/data-types.js';
import { getConfigValue } from '#lib/utils/config.js';
import { compensateAt } from './baseline.js';
import { lookupFRValueAtFreq } from '#lib/utils/fr-lookup.js';

export interface PreferenceBoundState {
	visible: boolean;
	rawBoundU: FRDataPoint[] | null;
	rawBoundD: FRDataPoint[] | null;
	dfNormalized: ChannelData | null;
	baselineChannelData: FRDataPoint[] | null;
}

/** Public surface the engine + GraphContainer depend on. */
export interface PreferenceBoundOverlayApi {
	update(state: PreferenceBoundState): void;
	render(): void;
	clear(): void;
}

/**
 * GraphPreferenceBoundOverlay — renders the upper/lower preference-range area as a single
 * filled D3 path inside the engine's curve group.
 *
 * Reactive data (smoothed bounds, normalized DF target, baseline channel data, visibility)
 * lives in preference-bound-store and GraphContainer pushes it in via update(). render()
 * recomputes the path from stored state against the engine's *current* scales, so an
 * imperative reposition (handle drag → GraphEngine.repositionCurves) repaints the bounds at
 * the new position without any store change.
 */
export class GraphPreferenceBoundOverlay implements PreferenceBoundOverlayApi {
	private graphEngine: GraphEngine;
	private readonly fillColor: string;
	private readonly strokeColor: string;

	private state: PreferenceBoundState = {
		visible: false,
		rawBoundU: null,
		rawBoundD: null,
		dfNormalized: null,
		baselineChannelData: null
	};

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this.fillColor =
			(getConfigValue('PREFERENCE_BOUND.COLOR_FILL') as string | undefined) ??
			'rgba(180,180,180,0.2)';
		this.strokeColor =
			(getConfigValue('PREFERENCE_BOUND.COLOR_BORDER') as string | undefined) ??
			'rgba(120,120,120,0.5)';
	}

	// ── Public API ───────────────────────────────────────────────────────────────

	/** Push the latest reactive state from the component, then redraw. */
	update(state: PreferenceBoundState): void {
		this.state = state;
		this.render();
	}

	/** Redraw using stored state against the engine's current scales. */
	render(): void {
		if (!this.graphEngine.curveGroup) return;

		const { visible, rawBoundU, rawBoundD, dfNormalized } = this.state;
		if (!visible || !rawBoundU || !rawBoundD || !dfNormalized) {
			this._removeBounds();
			return;
		}
		this._drawBounds();
	}

	/** Hide and remove the bound path (component unmount / teardown). */
	clear(): void {
		this.state.visible = false;
		this._removeBounds();
	}

	destroy(): void {
		this._removeBounds();
	}

	// ── Path building ──────────────────────────────────────────────────────────

	private _buildPathString(): string | null {
		const { rawBoundU, rawBoundD, dfNormalized, baselineChannelData } = this.state;
		if (!rawBoundU || !rawBoundD || !dfNormalized) return null;

		const { xScale, yScale } = this.graphEngine;
		const dfData = dfNormalized.data;

		const computeY = (freq: number, offset: number): number => {
			const dfY = lookupFRValueAtFreq(dfData, freq) ?? 0;
			return yScale(compensateAt(dfY + offset, freq, baselineChannelData));
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

	// ── D3 draw/remove ─────────────────────────────────────────────────────────

	private _drawBounds(): void {
		if (!this.graphEngine.curveGroup) return;

		const pathStr = this._buildPathString();
		if (!pathStr) {
			this._removeBounds();
			return;
		}

		const existing = this.graphEngine.curveGroup.select<SVGPathElement>('.preference-bound-area');

		if (existing.empty()) {
			this.graphEngine.curveGroup
				.insert('path', ':first-child')
				.attr('class', 'preference-bound-area')
				.attr('d', pathStr)
				.attr('fill', this.fillColor)
				.attr('stroke', this.strokeColor)
				.attr('stroke-width', 1)
				.style('pointer-events', 'none');
		} else {
			// Direct update — instant follow during handle drag (render() is called per
			// drag event by GraphEngine.repositionCurves). No transition: the bounds track
			// curves frame-for-frame.
			existing.interrupt().attr('d', pathStr);
		}
	}

	private _removeBounds(): void {
		const el = this.graphEngine.curveGroup?.select('.preference-bound-area');
		if (el && !el.empty()) {
			el.interrupt();
			el.remove();
		}
	}
}
