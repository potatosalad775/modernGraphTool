/**
 * `GraphEqOverlay` renders the draggable EQ band nodes on top of the graph.
 *
 * Driven through a minimal fake `GraphEngine` — the overlay only reads `svg`,
 * `graphGeometry`, `xScale`, `baseYScale`, `baselineData` and
 * `orderOverlayLayers()`. Runs in the `client` project because it builds real
 * SVG, attaches window key listeners and dispatches real pointer events; d3's
 * `pointer()` needs a laid-out element to invert against.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as d3 from 'd3';
import { GraphEqOverlay } from './GraphEqOverlay.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { FRDataObject, FRDataPoint } from '$lib/types/data-types.js';

const VIEW_W = 800;
const VIEW_H = 450;
const MARGIN = 15;

interface FakeEngine {
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	graphGeometry: { xStart: number; xEnd: number; yTop: number; yBottom: number };
	xScale: d3.ScaleLogarithmic<number, number>;
	baseYScale: d3.ScaleLinear<number, number>;
	baselineData: {
		uuid: string | null;
		identifier: string | null;
		channelData: FRDataPoint[] | null;
	};
	orderOverlayLayers: () => void;
}

let svgEl: SVGSVGElement;

function makeEngine(): FakeEngine {
	svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svgEl.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
	svgEl.style.width = `${VIEW_W}px`;
	svgEl.style.height = `${VIEW_H}px`;
	const svg = d3.select(svgEl);
	svg.append('defs');
	document.body.appendChild(svgEl);

	return {
		svg,
		graphGeometry: {
			xStart: MARGIN,
			xEnd: VIEW_W - MARGIN,
			yTop: MARGIN,
			yBottom: VIEW_H - MARGIN
		},
		xScale: d3
			.scaleLog()
			.domain([20, 20000])
			.range([MARGIN, VIEW_W - MARGIN]),
		baseYScale: d3
			.scaleLinear()
			.domain([-25, 25])
			.range([VIEW_H - MARGIN, MARGIN]),
		baselineData: { uuid: null, identifier: null, channelData: null },
		orderOverlayLayers: () => {}
	};
}

/** A log-spaced flat-ish curve for the source phone. */
function curveData(db = 80): FRDataPoint[] {
	const points: FRDataPoint[] = [];
	const step = Math.pow(2, 1 / 24);
	for (let f = 20; f <= 20000; f *= step) points.push([f, db]);
	return points;
}

function makePhone(uuid: string, db = 80): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Phone ${uuid}`,
		channels: { AVG: { data: curveData(db), metadata: { minFreq: 20, maxFreq: 20000 } } },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: '#00ff00' },
		dash: '1 0'
	};
}

function pk(freq: number, gain = 3, q = 1, enabled = true): EQFilter {
	return { enabled, type: 'PK', freq, q, gain };
}

function shelf(type: 'LSQ' | 'HSQ', freq: number, gain = 3): EQFilter {
	return { enabled: true, type, freq, q: 0.7, gain };
}

describe('GraphEqOverlay', () => {
	let engine: FakeEngine;
	let overlay: GraphEqOverlay;

	function nodes() {
		return engine.svg.selectAll('.eq-band-node');
	}

	beforeEach(() => {
		frStore.clear();
		// Any value outside OCTAVE_BANDS is a no-op in FRSmoother, which keeps the
		// assertions reading the input data rather than a smoothed resampling of it.
		graphStore.smoothValue = 'none';
		eqStore.filters = [];
		eqStore.isEnabled = true;
		eqStore.sourcePhoneUUID = null;
		eqStore.eqCurveUUID = null;
		eqConstraintsStore.setActive('default');

		engine = makeEngine();
		overlay = new GraphEqOverlay(engine as unknown as GraphEngine);
	});

	afterEach(() => {
		overlay.destroy();
		svgEl.remove();
		vi.restoreAllMocks();
	});

	// ── Setup / teardown ─────────────────────────────────────────────────────

	describe('SVG scaffolding', () => {
		it('creates a clipped wrapper and an inner overlay group', () => {
			expect(engine.svg.select('.fr-graph-eq-clip-wrapper').size()).toBe(1);
			expect(engine.svg.select('.fr-graph-eq-overlay').size()).toBe(1);
		});

		it('clips to the graph viewport', () => {
			const rect = engine.svg.select('#eq-overlay-clip rect');
			expect(rect.attr('x')).toBe(String(MARGIN));
			expect(rect.attr('width')).toBe(String(VIEW_W - 2 * MARGIN));
			expect(rect.attr('height')).toBe(String(VIEW_H - 2 * MARGIN));
		});

		it('destroy removes both the wrapper and the clipPath', () => {
			overlay.destroy();
			expect(engine.svg.select('.fr-graph-eq-clip-wrapper').size()).toBe(0);
			expect(engine.svg.select('#eq-overlay-clip').size()).toBe(0);
			// destroy() again in afterEach must stay harmless
			overlay = new GraphEqOverlay(engine as unknown as GraphEngine);
		});
	});

	// ── render() gating ──────────────────────────────────────────────────────

	describe('render gating', () => {
		beforeEach(() => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			eqStore.filters = [pk(1000)];
		});

		it('draws nothing while the EQ panel is closed', () => {
			overlay.render();
			expect(nodes().size()).toBe(0);
		});

		it('draws nothing while the equalizer is globally disabled', () => {
			overlay.setEqPanelActive(true);
			eqStore.isEnabled = false;
			overlay.render();
			expect(nodes().size()).toBe(0);
		});

		it('draws a node per filter once panel-active and enabled', () => {
			overlay.setEqPanelActive(true);
			expect(nodes().size()).toBe(1);
		});

		it('clears existing nodes when the panel closes again', () => {
			overlay.setEqPanelActive(true);
			expect(nodes().size()).toBe(1);
			overlay.setEqPanelActive(false);
			expect(nodes().size()).toBe(0);
		});

		it('skips disabled filters', () => {
			eqStore.filters = [pk(1000), pk(2000, 3, 1, false)];
			overlay.setEqPanelActive(true);
			expect(nodes().size()).toBe(1);
		});

		it('skips filters with no frequency or gain', () => {
			eqStore.filters = [
				pk(1000),
				{ enabled: true, type: 'PK', freq: null, q: 1, gain: 3 },
				{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: null }
			];
			overlay.setEqPanelActive(true);
			expect(nodes().size()).toBe(1);
		});

		it('drops PK nodes when no source phone is selected — they have no curve to sit on', () => {
			eqStore.sourcePhoneUUID = null;
			eqStore.filters = [pk(1000), shelf('LSQ', 100)];
			overlay.setEqPanelActive(true);

			// Only the shelf survives; it is positioned absolutely.
			expect(nodes().size()).toBe(1);
		});
	});

	// ── Node geometry ────────────────────────────────────────────────────────

	describe('node positioning', () => {
		beforeEach(() => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
		});

		function transformOf(index = 0): { x: number; y: number } {
			const t = nodes().nodes()[index] as SVGGElement;
			const [, x, y] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(t.getAttribute('transform')!)!;
			return { x: parseFloat(x), y: parseFloat(y) };
		}

		it('places a node at the x of its frequency', () => {
			eqStore.filters = [pk(1000)];
			overlay.setEqPanelActive(true);
			expect(transformOf().x).toBeCloseTo(engine.xScale(1000), 3);
		});

		it('places a shelf node at its absolute gain', () => {
			eqStore.filters = [shelf('HSQ', 8000, 6)];
			overlay.setEqPanelActive(true);
			expect(transformOf().y).toBeCloseTo(engine.baseYScale(6), 3);
		});

		it('clamps an out-of-range frequency into the axis domain', () => {
			eqStore.filters = [shelf('LSQ', 5, 3)];
			overlay.setEqPanelActive(true);
			expect(transformOf().x).toBeCloseTo(engine.xScale(20), 3);
		});

		it('parks a PK node offscreen when the source curve has no value there', () => {
			frStore.set('p', {
				...makePhone('p'),
				channels: { AVG: { data: [], metadata: { minFreq: 20, maxFreq: 20000 } } }
			});
			eqStore.filters = [pk(1000)];
			overlay.setEqPanelActive(true);
			expect(transformOf()).toEqual({ x: -100, y: -100 });
		});

		it('subtracts the baseline curve from a PK node position', () => {
			eqStore.filters = [pk(1000)];
			overlay.setEqPanelActive(true);
			const unbaselined = transformOf().y;

			engine.baselineData.channelData = curveData(10);
			overlay.render();

			// 80 dB curve minus a flat 10 dB baseline = 70 dB, i.e. lower on screen
			// than the uncompensated position (yScale is inverted).
			expect(transformOf().y).toBeCloseTo(engine.baseYScale(70), 3);
			expect(transformOf().y).not.toBeCloseTo(unbaselined, 3);
		});

		it('sizes the Q ring inversely to Q, clamped to [8, 40]', () => {
			eqStore.filters = [pk(1000, 3, 0.1), pk(2000, 3, 1), pk(4000, 3, 4), pk(8000, 3, 10)];
			overlay.setEqPanelActive(true);

			const radii = nodes()
				.selectAll('.eq-q-ring')
				.nodes()
				.map((n) => parseFloat((n as SVGCircleElement).getAttribute('r')!));

			expect(radii[0]).toBe(40); // 20/sqrt(0.1) = 63 → clamped to the ceiling
			expect(radii[1]).toBeCloseTo(20, 5);
			expect(radii[2]).toBeCloseTo(10, 5);
			expect(radii[3]).toBe(8); // 20/sqrt(10) = 6.3 → clamped to the floor
		});

		it('labels sub-kHz bands in Hz and the rest in kHz', () => {
			eqStore.filters = [pk(120), pk(1000), pk(3500)];
			overlay.setEqPanelActive(true);

			const labels = nodes()
				.selectAll('.eq-freq-label')
				.nodes()
				.map((n) => (n as SVGTextElement).textContent);

			expect(labels).toEqual(['120', '1k', '3.5k']);
		});

		it('takes the node color from the EQ curve entry when one exists', () => {
			frStore.set('eq', { ...makePhone('eq'), colors: { AVG: '#123456' } });
			eqStore.eqCurveUUID = 'eq';
			eqStore.filters = [pk(1000)];
			overlay.setEqPanelActive(true);

			expect(nodes().select('.eq-center-dot').attr('fill')).toBe('#123456');
		});
	});

	// ── Pointer interactions ─────────────────────────────────────────────────

	describe('node interactions', () => {
		beforeEach(() => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			eqStore.filters = [pk(1000), pk(4000)];
			overlay.setEqPanelActive(true);
		});

		it('removes a band on double click', () => {
			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			(nodes().nodes()[1] as SVGGElement).dispatchEvent(
				new MouseEvent('dblclick', { bubbles: true })
			);
			expect(spy).toHaveBeenCalledWith(1);
		});

		it('nudges Q down on a downward wheel tick', () => {
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			(nodes().nodes()[0] as SVGGElement).dispatchEvent(
				new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
			);
			expect(spy).toHaveBeenCalledWith(0, { q: 0.9 });
		});

		it('nudges Q up on an upward wheel tick', () => {
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			(nodes().nodes()[0] as SVGGElement).dispatchEvent(
				new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })
			);
			expect(spy).toHaveBeenCalledWith(0, { q: 1.1 });
		});

		it('clamps Q at the bottom of its range', () => {
			eqStore.filters = [pk(1000, 3, 0.1)];
			overlay.render();
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			(nodes().nodes()[0] as SVGGElement).dispatchEvent(
				new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
			);
			expect(spy).toHaveBeenCalledWith(0, { q: 0.1 });
		});

		it('grows the dot on hover and restores it on leave', () => {
			const node = nodes().nodes()[0] as SVGGElement;
			node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
			expect(d3.select(node).select('.eq-center-dot').attr('r')).toBe('8');

			node.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
			expect(d3.select(node).select('.eq-center-dot').attr('r')).toBe('6');
		});
	});

	// ── Click-to-add ─────────────────────────────────────────────────────────

	describe('click-to-add', () => {
		it('adds no click surface until a source phone is chosen', () => {
			overlay.setEqPanelActive(true);
			expect(engine.svg.select('.eq-click-area').size()).toBe(0);
		});

		it('adds the click surface when panel-active with a source phone', () => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			overlay.setEqPanelActive(true);
			expect(engine.svg.select('.eq-click-area').size()).toBe(1);
		});

		it('removes the click surface when the panel closes', () => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			overlay.setEqPanelActive(true);
			overlay.setEqPanelActive(false);
			expect(engine.svg.select('.eq-click-area').size()).toBe(0);
		});

		it('adds a PK band at the clicked position', () => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			overlay.setEqPanelActive(true);

			const spy = vi.spyOn(eqCommands, 'addBand').mockReturnValue(true);
			const rect = engine.svg.select<SVGRectElement>('.eq-click-area').node()!;
			const box = rect.getBoundingClientRect();
			rect.dispatchEvent(
				new MouseEvent('click', {
					bubbles: true,
					clientX: box.left + box.width / 2,
					clientY: box.top + box.height / 2
				})
			);

			expect(spy).toHaveBeenCalledTimes(1);
			const added = spy.mock.calls[0][0];
			expect(added.type).toBe('PK');
			expect(added.q).toBe(1);
			expect(added.freq).toBeGreaterThan(20);
			expect(added.freq).toBeLessThan(20000);
		});

		it('does not add a band while the equalizer is globally disabled', () => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			overlay.setEqPanelActive(true);

			const spy = vi.spyOn(eqCommands, 'addBand').mockReturnValue(true);
			eqStore.isEnabled = false;
			engine.svg
				.select<SVGRectElement>('.eq-click-area')
				.node()!
				.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			expect(spy).not.toHaveBeenCalled();
		});
	});

	// ── Keyboard ─────────────────────────────────────────────────────────────

	describe('keyboard', () => {
		/** Click-to-add auto-selects the new band, which is how a selection is made. */
		function selectNewestBand() {
			const rect = engine.svg.select<SVGRectElement>('.eq-click-area').node()!;
			const box = rect.getBoundingClientRect();
			rect.dispatchEvent(
				new MouseEvent('click', {
					bubbles: true,
					clientX: box.left + box.width / 2,
					clientY: box.top + box.height / 2
				})
			);
		}

		beforeEach(() => {
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			eqStore.filters = [pk(1000)];
			overlay.setEqPanelActive(true);
			selectNewestBand();
		});

		it('selects the band it just added, drawing it with the emphasised ring', () => {
			// The click handler records the selection; the emphasis lands on the next
			// render, which the panel's own reactive effect drives in the app.
			overlay.render();
			const selected = nodes()
				.selectAll('.eq-q-ring')
				.nodes()
				.filter((n) => (n as SVGCircleElement).getAttribute('stroke-width') === '3');
			expect(selected).toHaveLength(1);
		});

		it('deletes the selected band on Delete', () => {
			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
			expect(spy).toHaveBeenCalledTimes(1);
		});

		it('deletes the selected band on Backspace', () => {
			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
			expect(spy).toHaveBeenCalledTimes(1);
		});

		it('clears the selection on Escape', () => {
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			const emphasised = nodes()
				.selectAll('.eq-q-ring')
				.nodes()
				.filter((n) => (n as SVGCircleElement).getAttribute('stroke-width') === '3');
			expect(emphasised).toHaveLength(0);
		});

		it('nudges gain up by 0.1 dB on ArrowUp', () => {
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

			const [, patch] = spy.mock.calls[0];
			const gain = eqStore.filters[eqStore.filters.length - 1].gain ?? 0;
			expect(patch.gain).toBeCloseTo(Math.round((gain + 0.1) * 10) / 10, 5);
		});

		it('takes a 10x step with Shift held', () => {
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true })
			);

			const [, patch] = spy.mock.calls[0];
			const gain = eqStore.filters[eqStore.filters.length - 1].gain ?? 0;
			expect(patch.gain).toBeCloseTo(Math.round((gain + 1) * 10) / 10, 5);
		});

		it('nudges frequency on ArrowRight', () => {
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

			const [idx, patch] = spy.mock.calls[0];
			expect(patch.freq).toBe((eqStore.filters[idx].freq ?? 1000) + 1);
		});

		it('leaves frequency alone in graphic-EQ mode — bands are pinned', () => {
			eqConstraintsStore.setActive('generic-10-band');
			const spy = vi.spyOn(eqCommands, 'updateBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			expect(spy).not.toHaveBeenCalled();
		});

		it('ignores keys typed into a text field', () => {
			const input = document.createElement('input');
			document.body.appendChild(input);
			input.focus();

			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

			expect(spy).not.toHaveBeenCalled();
			input.remove();
		});

		it('ignores keys aimed at a bits-ui slider thumb', () => {
			const thumb = document.createElement('div');
			thumb.setAttribute('role', 'slider');
			document.body.appendChild(thumb);

			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

			expect(spy).not.toHaveBeenCalled();
			thumb.remove();
		});

		it('stops listening once the panel closes', () => {
			overlay.setEqPanelActive(false);
			const spy = vi.spyOn(eqCommands, 'removeBand').mockImplementation(() => {});
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
			expect(spy).not.toHaveBeenCalled();
		});
	});
});
