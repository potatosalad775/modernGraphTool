import { describe, it, expect, beforeEach } from 'vitest';
import * as d3 from 'd3';
import { GraphCompareOverlay, type CompareGhostState } from './GraphCompareOverlay.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import type { FRDataPoint } from '$lib/types/data-types.js';

// ── Minimal fake GraphEngine ──────────────────────────────────────────────────
// The overlay only reads curveGroup + xScale + yScale.

interface FakeEngine {
	curveGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	xScale: d3.ScaleLogarithmic<number, number>;
	yScale: d3.ScaleLinear<number, number>;
}

function makeEngine(): FakeEngine {
	const svg = d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
	return {
		curveGroup: svg.append('g').attr('class', 'fr-graph-curve-container'),
		xScale: d3.scaleLog().domain([20, 20000]).range([0, 800]),
		yScale: d3.scaleLinear().domain([-25, 25]).range([400, 0])
	};
}

const LEFT: FRDataPoint[] = [
	[100, 4],
	[1000, 2],
	[10000, -3]
];
const RIGHT: FRDataPoint[] = [
	[100, 3],
	[1000, 1],
	[10000, -4]
];

const VISIBLE: CompareGhostState = {
	visible: true,
	label: 'B (compare)',
	curves: [LEFT],
	yOffset: 0,
	baselineChannelData: null
};

function paths(engine: FakeEngine) {
	return engine.curveGroup.selectAll<SVGPathElement, unknown>('g.fr-graph-compare-ghost path');
}

/** The y pixel of the first point of the first path — d3 rounds, so compare with toBeCloseTo. */
function firstY(engine: FakeEngine): number {
	const d = paths(engine).node()!.getAttribute('d')!;
	return Number(/^M[-\d.]+,([-\d.]+)/.exec(d)![1]);
}

describe('GraphCompareOverlay', () => {
	let engine: FakeEngine;
	let overlay: GraphCompareOverlay;

	beforeEach(() => {
		engine = makeEngine();
		overlay = new GraphCompareOverlay(engine as unknown as GraphEngine);
	});

	it('draws nothing while hidden', () => {
		overlay.update({ ...VISIBLE, visible: false });
		expect(paths(engine).size()).toBe(0);
	});

	it('draws one dashed, non-interactive path per channel, colored by the graph token', () => {
		overlay.update({ ...VISIBLE, curves: [LEFT, RIGHT] });
		expect(paths(engine).size()).toBe(2);
		const el = paths(engine).node()!;
		expect(el.getAttribute('stroke-dasharray')).toBe('6 4');
		expect(el.style.stroke).toContain('--color-graph-compare');
		const group = engine.curveGroup.select<SVGGElement>('g.fr-graph-compare-ghost').node()!;
		expect(group.style.pointerEvents).toBe('none');
	});

	it('labels the ghost in English beside its right end', () => {
		overlay.update(VISIBLE);
		const text = engine.curveGroup.select('g.fr-graph-compare-ghost text');
		expect(text.text()).toBe('B (compare)');
		expect(Number(text.attr('x'))).toBeCloseTo(engine.xScale(10000) - 4, 2);
	});

	it('updates in place rather than duplicating', () => {
		overlay.update(VISIBLE);
		overlay.update({ ...VISIBLE, curves: [RIGHT] });
		expect(paths(engine).size()).toBe(1);
		expect(engine.curveGroup.selectAll('g.fr-graph-compare-ghost').size()).toBe(1);
		expect(firstY(engine)).toBeCloseTo(engine.yScale(3), 2);
	});

	it('subtracts the baseline and adds the EQ curve offset', () => {
		const baseline: FRDataPoint[] = [
			[100, 1],
			[10000, 1]
		];
		overlay.update({ ...VISIBLE, baselineChannelData: baseline, yOffset: 2 });
		// 4 dB at 100 Hz, minus 1 dB of baseline, plus a 2 dB offset.
		expect(firstY(engine)).toBeCloseTo(engine.yScale(5), 2);
	});

	it('render() follows the engine’s current yScale (handle drag)', () => {
		overlay.update(VISIBLE);
		engine.yScale = d3.scaleLinear().domain([-15, 35]).range([400, 0]);
		overlay.render();
		expect(firstY(engine)).toBeCloseTo(engine.yScale(4), 2);
	});

	it('removes itself when the curves go away, and on clear()', () => {
		overlay.update(VISIBLE);
		overlay.update({ ...VISIBLE, curves: [] });
		expect(engine.curveGroup.selectAll('g.fr-graph-compare-ghost').size()).toBe(0);

		overlay.update(VISIBLE);
		overlay.clear();
		expect(engine.curveGroup.selectAll('g.fr-graph-compare-ghost').size()).toBe(0);
	});
});
