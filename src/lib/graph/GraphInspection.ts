import * as d3 from 'd3';
import { isTargetType, type FRDataPoint } from '#lib/types/data-types.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { curveTraces, listedTraces } from './curve-traces.js';
import { eqSourceContextFor } from './eq-source-context.js';
import { baseline, compensateAt } from './baseline.js';
import { lookupFRValueAtFreq } from '#lib/utils/fr-lookup.js';

/** How far the mouse tracker extends past the plot edges, in viewBox units.
 *  There are 15 units of margin on each side, so this stays inside the SVG. */
const TRACKER_OVERHANG = 4;

/**
 * The item's Y-offset as a suffix, e.g. ` (+1)` / ` (-2.5)`; empty for none.
 * The readout reports the true level, but the curve is drawn shifted by this
 * much, so the note says why the two disagree on screen. Rounded to 2 decimals
 * (the offset box takes any decimal) with trailing zeros dropped. Plain ASCII
 * and numeric on purpose, like every graph label.
 */
function yOffsetNote(yOffset: number | undefined): string {
	const magnitude = Number(Math.abs(yOffset ?? 0).toFixed(2));
	if (!magnitude) return '';
	return ` (${yOffset! > 0 ? '+' : '-'}${magnitude})`;
}

class GraphInspection {
	graphEngine: GraphEngine;
	isEnabled: boolean;
	verticalLine!: d3.Selection<SVGLineElement, unknown, null, undefined>;
	inspectionGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	valueDisplay!: d3.Selection<SVGGElement, unknown, null, undefined>;
	bisector: (array: ArrayLike<FRDataPoint>, x: number, lo?: number, hi?: number) => number;
	frequencyText!: d3.Selection<SVGTextElement, unknown, null, undefined>;
	mouseTracker: d3.Selection<SVGRectElement, unknown, null, undefined> | null;

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this.isEnabled = false;
		this.mouseTracker = null;
		this.bisector = d3.bisector<FRDataPoint, number>((d) => d[0]).left;

		this._setupInspectionElements();
	}

	_setupInspectionElements() {
		this.inspectionGroup = this.graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-inspection')
			.style('pointer-events', 'none')
			.style('display', 'none');

		this.verticalLine = this.inspectionGroup
			.append('line')
			.attr('class', 'inspection-line')
			.attr('y1', this.graphEngine.graphGeometry.yTop)
			.attr('y2', this.graphEngine.graphGeometry.yBottom)
			.attr('stroke', 'var(--color-base-content)')
			.attr('stroke-width', 1)
			.attr('stroke-dasharray', '2,2')
			.attr('opacity', 0.7);

		this.valueDisplay = this.inspectionGroup.append('g').attr('class', 'inspection-values');

		this.frequencyText = this.inspectionGroup
			.append('text')
			.attr('class', 'inspection-frequency')
			.attr('y', this.graphEngine.graphGeometry.yBottom - 15)
			.attr('text-anchor', 'middle')
			.attr('font-size', '14px')
			.attr('font-weight', 'bold')
			.attr('fill', 'var(--color-base-content)');
	}

	/** Called by GraphPanel component to toggle inspection mode */
	setEnabled(enabled: boolean) {
		this.isEnabled = enabled;

		if (enabled) {
			this._enableMouseTracking();
			this._hideLabels();
			this.inspectionGroup.style('display', 'block');
		} else {
			this._disableMouseTracking();
			this._showLabels();
			this.inspectionGroup.style('display', 'none');
		}
	}

	_enableMouseTracking() {
		// Re-enabling without disabling first would orphan the previous rect: it
		// keeps `pointer-events: all` and its mousemove handler, stacked over the
		// plot, and `_disableMouseTracking` only ever removes the newest one.
		this._disableMouseTracking();

		// Overhang past the plot edges, into the margin. A pointer position is an
		// integer CSS pixel, so a rect ending exactly on `xEnd` leaves the final
		// pixel column unreachable — and on a log axis that one pixel is a constant
		// ~0.65% of the *frequency*, i.e. ~130 Hz at the 20 kHz end. Without this the
		// axis tops out around 19870 Hz. `_onMouseMove` clamps back into the domain.
		const g = this.graphEngine.graphGeometry;
		this.mouseTracker = this.graphEngine.svg
			.append('rect')
			.attr('class', 'mouse-tracker')
			.attr('x', g.xStart - TRACKER_OVERHANG)
			.attr('y', g.yTop)
			.attr('width', g.xEnd - g.xStart + TRACKER_OVERHANG * 2)
			.attr('height', g.yBottom - g.yTop)
			.attr('fill', 'none')
			.attr('pointer-events', 'all')
			.style('cursor', 'crosshair');

		this.mouseTracker
			.on('mousemove', (event) => this._onMouseMove(event))
			.on('mouseleave', () => this._onMouseLeave());
	}

	_disableMouseTracking() {
		if (this.mouseTracker) {
			this.mouseTracker.remove();
			this.mouseTracker = null;
		}
	}

	_onMouseMove(event: MouseEvent) {
		const [rawX] = d3.pointer(event);
		const g = this.graphEngine.graphGeometry;
		// Clamp the overhang back onto the plot so the readout stays inside the
		// 20 Hz–20 kHz domain and `_interpolateSPL` never extrapolates.
		const mouseX = Math.min(Math.max(rawX, g.xStart), g.xEnd);
		const frequency = this.graphEngine.xScale.invert(mouseX);

		this.verticalLine.attr('x1', mouseX).attr('x2', mouseX);
		this._updateFrequencyDisplay(frequency, mouseX);
		this._updateValueDisplays(frequency, mouseX);
	}

	_onMouseLeave() {
		this.inspectionGroup.style('opacity', 0.7);
	}

	_updateFrequencyDisplay(frequency: number, mouseX: number) {
		const frequencyString = `${Math.round(frequency)}Hz`;

		const textWidth = frequencyString.length * 10;
		const halfTextWidth = textWidth / 2;

		let textX = mouseX;
		let textAnchor = 'middle';

		if (mouseX + halfTextWidth > this.graphEngine.graphGeometry.xEnd) {
			textX = mouseX - 10;
			textAnchor = 'end';
		} else if (mouseX - halfTextWidth < this.graphEngine.graphGeometry.xStart) {
			textX = mouseX + 10;
			textAnchor = 'start';
		}

		this.frequencyText.attr('x', textX).attr('text-anchor', textAnchor).text(frequencyString);
	}

	_updateValueDisplays(frequency: number, mouseX: number) {
		this.valueDisplay.selectAll('*').remove();

		let yOffset = 0;
		const lineHeight = 18;
		const rectPadding = 10;

		const deviceListData: {
			displayText: string;
			textWidth: number;
			color: string;
			yOffset: number;
		}[] = [];

		Array.from(frStore.entries)
			.filter(([, obj]) => !obj.hidden)
			.sort(([, a], [, b]) => Number(isTargetType(b)) - Number(isTargetType(a)))
			.forEach(([, obj]) => {
				// One row per trace the item draws: its main traces, then its runs. A run
				// is indented under them. An EQ'd run stands in for the average on the
				// graph, so it is a main trace here too (`curveTraces`).
				const offsetNote = yOffsetNote(obj.yOffset);
				for (const trace of listedTraces(curveTraces(obj, eqSourceContextFor(obj)))) {
					const splValue = this._interpolateSPL(trace.data, frequency);
					if (splValue === null) continue;

					const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);
					const indent = trace.kind === 'run' ? '  ' : '';

					deviceListData.push({
						displayText: `${indent}${trace.name}: ${compensatedSPL.toFixed(1)}dB${offsetNote}`,
						textWidth: 0,
						color: trace.color,
						yOffset
					});

					yOffset += lineHeight;
				}
			});

		// Pre-pass: measure each entry's actual rendered text width via a hidden
		// scratch text node. Required for both backdrop sizing AND for the
		// edge-fitting logic below — character-count heuristics misjudge layout
		// for proportional fonts (Pretendard).
		const scratch = this.valueDisplay
			.append('text')
			.attr('font-size', '14px')
			.attr('font-weight', '500')
			.style('visibility', 'hidden');
		let maxTextWidth = 0;
		for (const item of deviceListData) {
			scratch.text(item.displayText);
			item.textWidth = scratch.node()!.getBBox().width + rectPadding * 2;
			if (item.textWidth > maxTextWidth) maxTextWidth = item.textWidth;
		}
		scratch.remove();

		const listPadding = 15;
		const rightEdgeSpace = this.graphEngine.graphGeometry.xEnd - mouseX;
		const leftEdgeSpace = mouseX - this.graphEngine.graphGeometry.xStart;

		let listX: number;
		let textAnchor: string;

		if (rightEdgeSpace >= maxTextWidth + listPadding) {
			listX = mouseX + listPadding;
			textAnchor = 'start';
		} else if (leftEdgeSpace >= maxTextWidth + listPadding) {
			listX = mouseX - listPadding;
			textAnchor = 'end';
		} else if (rightEdgeSpace > leftEdgeSpace) {
			listX = mouseX + 10;
			textAnchor = 'start';
		} else {
			listX = mouseX - 10;
			textAnchor = 'end';
		}

		deviceListData.forEach((item) => {
			const valueGroup = this.valueDisplay
				.append('g')
				.attr(
					'transform',
					`translate(${listX}, ${this.graphEngine.graphGeometry.yTop + 32 + item.yOffset})`
				);

			const rectX = textAnchor === 'start' ? -rectPadding : -(item.textWidth - rectPadding);

			valueGroup
				.append('rect')
				.attr('x', rectX)
				.attr('y', -16)
				.attr('width', item.textWidth)
				.attr('height', 18)
				.attr('fill', 'var(--color-base-200)')
				.attr('rx', 2)
				.attr('opacity', 0.7);

			valueGroup
				.append('text')
				.attr('x', 0)
				.attr('y', -2)
				.attr('text-anchor', textAnchor)
				.attr('font-size', '14px')
				.attr('font-weight', '500')
				.attr('fill', item.color)
				.text(item.displayText);
		});

		this.inspectionGroup.style('opacity', 1);
	}

	_interpolateSPL(channelData: [number, number][], frequency: number): number | null {
		return lookupFRValueAtFreq(channelData, frequency);
	}

	_applyBaselineCompensation(splValue: number, frequency: number): number {
		return compensateAt(splValue, frequency, baseline.channelData);
	}

	_hideLabels() {
		this.graphEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').style('display', 'none');
	}

	_showLabels() {
		this.graphEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').style('display', 'block');
	}

	onLabelsUpdated() {
		if (this.isEnabled) {
			this._hideLabels();
		}
	}

	destroy() {
		this._disableMouseTracking();
		if (this.inspectionGroup) {
			this.inspectionGroup.remove();
		}
	}
}

export default GraphInspection;
