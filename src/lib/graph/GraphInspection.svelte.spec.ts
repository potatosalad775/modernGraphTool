import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as d3 from 'd3';
import GraphInspection from './GraphInspection.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { ChannelData, FRDataObject, FRDataPoint } from '$lib/types/data-types.js';

/**
 * The inspection overlay reads `frStore` and writes SVG. It runs in the client
 * project because the layout pass measures each label with `getBBox()`, which
 * only returns real numbers for an element in the document.
 */

const GEOMETRY = { xStart: 60, xEnd: 760, yTop: 20, yBottom: 400 };

interface FakeEngine {
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	graphGeometry: typeof GEOMETRY;
	xScale: d3.ScaleLogarithmic<number, number>;
	getBaselineData: () => { uuid: string | null; channelData: FRDataPoint[] | null };
}

let host: SVGSVGElement;
let engine: FakeEngine;
let inspection: GraphInspection;

function makeEngine(baseline: FRDataPoint[] | null = null): FakeEngine {
	host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	host.setAttribute('width', '800');
	host.setAttribute('height', '450');
	document.body.appendChild(host);

	return {
		svg: d3.select(host),
		graphGeometry: GEOMETRY,
		xScale: d3.scaleLog().domain([20, 20000]).range([GEOMETRY.xStart, GEOMETRY.xEnd]),
		getBaselineData: () => ({ uuid: baseline ? 'baseline' : null, channelData: baseline })
	};
}

function makeInspection(e: FakeEngine): GraphInspection {
	return new GraphInspection(e as unknown as GraphEngine);
}

/** A flat channel at `db`, on a grid dense enough to interpolate anywhere. */
function channel(db: number): ChannelData {
	const data: FRDataPoint[] = Array.from({ length: 50 }, (_, i) => [
		20 * Math.pow(1000, i / 49),
		db
	]);
	return { data, metadata: { minFreq: 20, maxFreq: 20000 } };
}

function addPhone(uuid: string, identifier: string, db: number, extra: Partial<FRDataObject> = {}) {
	frStore.set(uuid, {
		uuid,
		type: 'phone',
		identifier,
		channels: { L: channel(db), R: channel(db - 2), AVG: channel(db - 1) },
		dispChannel: ['AVG'],
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '',
		...extra
	} as FRDataObject);
}

/** Drive a mousemove at the x position of `hz`. */
function hoverAt(hz: number) {
	const x = engine.xScale(hz);
	const rect = host.querySelector('.mouse-tracker') as SVGRectElement;
	rect.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 200, bubbles: true }));
}

function labels(): string[] {
	return [...host.querySelectorAll('.inspection-values g text')].map((n) => n.textContent ?? '');
}

describe('GraphInspection', () => {
	beforeEach(() => {
		for (const uuid of [...frStore.entries.keys()]) frStore.delete(uuid);
		engine = makeEngine();
		inspection = makeInspection(engine);
	});

	afterEach(() => {
		inspection.destroy();
		host.remove();
	});

	describe('setup', () => {
		it('creates a hidden inspection group with a dashed vertical line', () => {
			const group = host.querySelector('.fr-graph-inspection') as SVGGElement;
			expect(group).not.toBeNull();
			expect(group.style.display).toBe('none');

			const line = host.querySelector('.inspection-line') as SVGLineElement;
			expect(line.getAttribute('y1')).toBe(String(GEOMETRY.yTop));
			expect(line.getAttribute('y2')).toBe(String(GEOMETRY.yBottom));
			expect(line.getAttribute('stroke-dasharray')).toBe('2,2');
		});

		it('does not attach a mouse tracker until enabled', () => {
			expect(host.querySelector('.mouse-tracker')).toBeNull();
		});
	});

	describe('setEnabled', () => {
		it('shows the group, adds the tracker and hides curve labels', () => {
			engine.svg.append('text').attr('class', 'fr-graph-label');
			inspection.setEnabled(true);

			expect(inspection.isEnabled).toBe(true);
			expect((host.querySelector('.fr-graph-inspection') as SVGGElement).style.display).toBe(
				'block'
			);
			expect(host.querySelector('.mouse-tracker')).not.toBeNull();
			expect((host.querySelector('.fr-graph-label') as SVGTextElement).style.display).toBe('none');
		});

		it('sizes the tracker to the plot area', () => {
			inspection.setEnabled(true);
			const rect = host.querySelector('.mouse-tracker') as SVGRectElement;

			expect(rect.getAttribute('x')).toBe(String(GEOMETRY.xStart));
			expect(rect.getAttribute('width')).toBe(String(GEOMETRY.xEnd - GEOMETRY.xStart));
			expect(rect.getAttribute('height')).toBe(String(GEOMETRY.yBottom - GEOMETRY.yTop));
		});

		it('removes the tracker and restores labels when disabled', () => {
			engine.svg.append('text').attr('class', 'fr-graph-label');
			inspection.setEnabled(true);
			inspection.setEnabled(false);

			expect(inspection.isEnabled).toBe(false);
			expect(host.querySelector('.mouse-tracker')).toBeNull();
			expect((host.querySelector('.fr-graph-label') as SVGTextElement).style.display).toBe('block');
			expect((host.querySelector('.fr-graph-inspection') as SVGGElement).style.display).toBe(
				'none'
			);
		});

		it('is idempotent — enabling twice leaves one tracker', () => {
			inspection.setEnabled(true);
			inspection.setEnabled(true);
			expect(host.querySelectorAll('.mouse-tracker')).toHaveLength(1);
		});
	});

	describe('frequency readout', () => {
		beforeEach(() => inspection.setEnabled(true));

		it('formats sub-kHz frequencies in Hz and the rest in kHz', () => {
			hoverAt(500);
			expect(host.querySelector('.inspection-frequency')!.textContent).toMatch(/^\d+Hz$/);

			hoverAt(5000);
			expect(host.querySelector('.inspection-frequency')!.textContent).toBe('5.0kHz');
		});

		it('centres the readout in the middle of the plot', () => {
			hoverAt(1000);
			expect(host.querySelector('.inspection-frequency')!.getAttribute('text-anchor')).toBe(
				'middle'
			);
		});

		it('flips the anchor near the right and left edges', () => {
			hoverAt(19500);
			expect(host.querySelector('.inspection-frequency')!.getAttribute('text-anchor')).toBe('end');

			hoverAt(21);
			expect(host.querySelector('.inspection-frequency')!.getAttribute('text-anchor')).toBe(
				'start'
			);
		});

		it('tracks the cursor with the vertical line', () => {
			hoverAt(1000);
			const line = host.querySelector('.inspection-line') as SVGLineElement;
			expect(Number(line.getAttribute('x1'))).toBeCloseTo(engine.xScale(1000), 0);
			expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'));
		});
	});

	describe('value list', () => {
		beforeEach(() => inspection.setEnabled(true));

		it('lists one row per displayed channel, labelled with the channel', () => {
			addPhone('a', 'Phone A', 80, { dispChannel: ['L', 'R'] });
			hoverAt(1000);

			expect(labels()).toEqual(['Phone A (L): 80.0dB', 'Phone A (R): 78.0dB']);
		});

		it('omits the channel suffix for targets and shows them first', () => {
			addPhone('a', 'Phone A', 80);
			frStore.set('t', {
				uuid: 't',
				type: 'target',
				identifier: 'Harman Target',
				channels: { AVG: channel(75) },
				dispChannel: ['AVG'],
				colors: { AVG: '#888888' },
				dash: ''
			} as FRDataObject);

			hoverAt(1000);
			expect(labels()[0]).toBe('Harman Target: 75.0dB');
			expect(labels()[1]).toBe('Phone A (AVG): 79.0dB');
		});

		it('skips hidden curves', () => {
			addPhone('a', 'Phone A', 80);
			addPhone('b', 'Phone B', 70, { hidden: true });

			hoverAt(1000);
			expect(labels()).toHaveLength(1);
			expect(labels()[0]).toContain('Phone A');
		});

		it('renders a backdrop behind every row', () => {
			addPhone('a', 'Phone A', 80, { dispChannel: ['L', 'R'] });
			hoverAt(1000);

			expect(host.querySelectorAll('.inspection-values g rect')).toHaveLength(2);
		});

		it('colours each row with its channel colour', () => {
			addPhone('a', 'Phone A', 80, { dispChannel: ['L', 'R'] });
			hoverAt(1000);

			const fills = [...host.querySelectorAll('.inspection-values g text')].map((n) =>
				n.getAttribute('fill')
			);
			expect(fills).toEqual(['#ff0000', '#0000ff']);
		});

		it('clears the previous rows on each move', () => {
			addPhone('a', 'Phone A', 80);
			hoverAt(1000);
			hoverAt(2000);

			expect(labels()).toHaveLength(1);
		});

		it('lists selected sample traces under their parent, indented', () => {
			addPhone('a', 'Phone A', 80, {
				samples: [
					{ L: channel(81), R: channel(79) },
					{ L: channel(83), R: channel(77) }
				],
				dispSamples: ['L2'],
				colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00', samples: { L2: '#123456' } }
			} as Partial<FRDataObject>);

			hoverAt(1000);
			expect(labels()[1]).toBe('  Phone A (L2): 83.0dB');
			expect([...host.querySelectorAll('.inspection-values g text')][1].getAttribute('fill')).toBe(
				'#123456'
			);
		});

		it('ignores sample keys that do not name a real sample', () => {
			addPhone('a', 'Phone A', 80, {
				samples: [{ L: channel(81) }],
				dispSamples: ['AVG', 'L9']
			} as Partial<FRDataObject>);

			hoverAt(1000);
			expect(labels()).toHaveLength(1);
		});

		it('places the list to the right of the cursor when there is room', () => {
			addPhone('a', 'Phone A', 80);
			hoverAt(30);

			const group = host.querySelector('.inspection-values g') as SVGGElement;
			expect(
				group.getAttribute('text-anchor') ??
					group.querySelector('text')!.getAttribute('text-anchor')
			).toBe('start');
		});

		it('flips the list to the left of the cursor near the right edge', () => {
			addPhone('a', 'A Rather Long Headphone Name Here', 80);
			hoverAt(19000);

			const text = host.querySelector('.inspection-values g text') as SVGTextElement;
			expect(text.getAttribute('text-anchor')).toBe('end');
		});
	});

	describe('baseline compensation', () => {
		beforeEach(() => {
			engine = makeEngine(
				Array.from({ length: 50 }, (_, i) => [20 * Math.pow(1000, i / 49), 5] as FRDataPoint)
			);
			inspection = makeInspection(engine);
			inspection.setEnabled(true);
		});

		it('subtracts the baseline from every reported value', () => {
			addPhone('a', 'Phone A', 80);
			hoverAt(1000);
			expect(labels()[0]).toBe('Phone A (AVG): 74.0dB');
		});

		it('reports raw values when no baseline is set', () => {
			engine = makeEngine(null);
			inspection.destroy();
			inspection = makeInspection(engine);
			inspection.setEnabled(true);

			addPhone('a', 'Phone A', 80);
			hoverAt(1000);
			expect(labels()[0]).toBe('Phone A (AVG): 79.0dB');
		});
	});

	describe('_interpolateSPL', () => {
		it('interpolates linearly between the bracketing points', () => {
			const data: FRDataPoint[] = [
				[100, 10],
				[200, 20]
			];
			expect(inspection._interpolateSPL(data, 150)).toBeCloseTo(15, 6);
		});

		it('clamps to the first and last point outside the measured range', () => {
			const data: FRDataPoint[] = [
				[100, 10],
				[200, 20]
			];
			expect(inspection._interpolateSPL(data, 50)).toBe(10);
			expect(inspection._interpolateSPL(data, 500)).toBe(20);
		});

		it('returns null for empty data', () => {
			expect(inspection._interpolateSPL([], 1000)).toBeNull();
		});
	});

	describe('onLabelsUpdated', () => {
		it('re-hides labels only while inspection is on', () => {
			const label = engine.svg.append('text').attr('class', 'fr-graph-label');

			inspection.onLabelsUpdated();
			expect(label.node()!.style.display).toBe('');

			inspection.setEnabled(true);
			label.style('display', 'block');
			inspection.onLabelsUpdated();
			expect(label.node()!.style.display).toBe('none');
		});
	});

	describe('destroy', () => {
		it('removes the overlay and the tracker', () => {
			inspection.setEnabled(true);
			inspection.destroy();

			expect(host.querySelector('.fr-graph-inspection')).toBeNull();
			expect(host.querySelector('.mouse-tracker')).toBeNull();
		});
	});
});
