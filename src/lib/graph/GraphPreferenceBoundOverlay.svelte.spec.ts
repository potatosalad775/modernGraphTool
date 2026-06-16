import { describe, it, expect, beforeEach } from 'vitest';
import * as d3 from 'd3';
import { GraphPreferenceBoundOverlay } from './GraphPreferenceBoundOverlay.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import type { ChannelData, FRDataPoint } from '$lib/types/data-types.js';

// ── Minimal fake GraphEngine ──────────────────────────────────────────────────
// The overlay only reads curveGroup + xScale + yScale + transitionDuration.

function meta(): ChannelData['metadata'] {
	return { minFreq: 20, maxFreq: 20000 };
}

const BOUND_U: FRDataPoint[] = [
	[100, 6],
	[1000, 4],
	[10000, 8]
];
const BOUND_D: FRDataPoint[] = [
	[100, -6],
	[1000, -4],
	[10000, -8]
];
const DF: ChannelData = {
	data: [
		[100, 0],
		[1000, 5],
		[10000, -2]
	],
	metadata: meta()
};
const BASELINE: FRDataPoint[] = [
	[100, 1],
	[1000, 2],
	[10000, 3]
];

interface FakeEngine {
	curveGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	xScale: d3.ScaleLogarithmic<number, number>;
	yScale: d3.ScaleLinear<number, number>;
	transitionDuration: number;
}

function makeEngine(): FakeEngine {
	const svg = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
	const curveGroup = svg.append('g').attr('class', 'fr-graph-curve-container');
	return {
		curveGroup,
		xScale: d3.scaleLog().domain([20, 20000]).range([0, 800]),
		yScale: d3.scaleLinear().domain([-25, 25]).range([400, 0]),
		transitionDuration: 0
	};
}

function makeOverlay(engine: FakeEngine): GraphPreferenceBoundOverlay {
	return new GraphPreferenceBoundOverlay(engine as unknown as GraphEngine);
}

const VISIBLE_STATE = {
	visible: true,
	rawBoundU: BOUND_U,
	rawBoundD: BOUND_D,
	dfNormalized: DF,
	baselineChannelData: null as FRDataPoint[] | null
};

function pathCount(engine: FakeEngine): number {
	return engine.curveGroup.selectAll('.preference-bound-area').size();
}

function pathD(engine: FakeEngine): string {
	return engine.curveGroup.select<SVGPathElement>('.preference-bound-area').attr('d') ?? '';
}

describe('GraphPreferenceBoundOverlay', () => {
	let engine: FakeEngine;
	let overlay: GraphPreferenceBoundOverlay;

	beforeEach(() => {
		engine = makeEngine();
		overlay = makeOverlay(engine);
	});

	it('does not draw when not visible', () => {
		overlay.update({ ...VISIBLE_STATE, visible: false });
		expect(pathCount(engine)).toBe(0);
	});

	it('draws a single closed filled path when visible with full data', () => {
		overlay.update({ ...VISIBLE_STATE });
		expect(pathCount(engine)).toBe(1);
		const d = pathD(engine);
		expect(d.startsWith('M')).toBe(true);
		expect(d.endsWith('Z')).toBe(true);
	});

	it('inserts the bound as the first child so it renders behind curves', () => {
		engine.curveGroup.append('path').attr('class', 'fr-graph-x-curve');
		overlay.update({ ...VISIBLE_STATE });
		const first = engine.curveGroup.node()!.firstElementChild;
		expect(first?.getAttribute('class')).toBe('preference-bound-area');
	});

	it('updates the existing path in place rather than duplicating', () => {
		overlay.update({ ...VISIBLE_STATE });
		const before = pathD(engine);
		overlay.update({ ...VISIBLE_STATE, dfNormalized: { ...DF, data: BOUND_U } });
		expect(pathCount(engine)).toBe(1);
		expect(pathD(engine)).not.toBe(before);
	});

	it('render() reflects the engine current yScale (handle-drag fix)', () => {
		overlay.update({ ...VISIBLE_STATE });
		const before = pathD(engine);

		// Simulate a Y-axis handle shift: the engine swaps in a panned yScale,
		// then calls overlay.render() (as repositionCurves does) — no state change.
		engine.yScale = d3.scaleLinear().domain([-15, 35]).range([400, 0]);
		overlay.render();

		expect(pathCount(engine)).toBe(1);
		expect(pathD(engine)).not.toBe(before);
	});

	it('subtracts baseline channel data when provided', () => {
		overlay.update({ ...VISIBLE_STATE, baselineChannelData: null });
		const withoutBaseline = pathD(engine);
		overlay.update({ ...VISIBLE_STATE, baselineChannelData: BASELINE });
		expect(pathD(engine)).not.toBe(withoutBaseline);
	});

	it('removes the path when data goes missing while visible', () => {
		overlay.update({ ...VISIBLE_STATE });
		expect(pathCount(engine)).toBe(1);
		overlay.update({ ...VISIBLE_STATE, dfNormalized: null });
		expect(pathCount(engine)).toBe(0);
	});

	it('clear() and destroy() remove the path', () => {
		overlay.update({ ...VISIBLE_STATE });
		overlay.clear();
		expect(pathCount(engine)).toBe(0);

		overlay.update({ ...VISIBLE_STATE });
		overlay.destroy();
		expect(pathCount(engine)).toBe(0);
	});
});
