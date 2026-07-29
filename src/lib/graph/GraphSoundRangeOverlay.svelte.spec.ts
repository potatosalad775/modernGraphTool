/**
 * `GraphSoundRangeOverlay` draws the listening-range band and, while active,
 * lays a transparent rect over the plot that captures drags to redraw it. That
 * rect is the interesting part: it exists only in range mode, and while it
 * exists it is what stops `GraphEqOverlay` from seeing the same pointer events.
 *
 * Driven through a minimal fake engine — the overlay reads only `svg`,
 * `graphGeometry`, `xScale` and `orderOverlayLayers()`. Runs in the `client`
 * project because d3-drag needs a laid-out element to invert pointers against.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as d3 from 'd3';
import { GraphSoundRangeOverlay } from './GraphSoundRangeOverlay.js';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { audioRangeStore } from '$lib/stores/audio-range-store.svelte.js';

const VIEW_W = 800;
const VIEW_H = 450;
const MARGIN = 15;

let svgEl: SVGSVGElement;

function makeEngine() {
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
		orderOverlayLayers: () => {}
	};
}

function band() {
	return svgEl.querySelector<SVGRectElement>('.fr-graph-sound-range-band')!;
}

function badge() {
	return svgEl.querySelector<SVGTextElement>('.fr-graph-sound-range-badge')!;
}

function clickRect() {
	return svgEl.querySelector<SVGRectElement>('.fr-graph-sound-range-click');
}

function opacityOf(el: Element): number {
	return Number(el.getAttribute('opacity'));
}

/**
 * Drives a full press-move-release through the click rect. Arguments are SVG
 * user-space x coordinates — the svg is laid out 1:1 with its viewBox, so they
 * are offset by the element's own position to reach client space.
 *
 * Mouse events, not pointer events: d3-drag v3 binds `mousedown.drag` and
 * registers its move/up listeners on `event.view`, so a synthetic PointerEvent —
 * or a MouseEvent built without a `view` — starts a drag that can never move or
 * end, and the assertion then reads an unchanged range rather than a failure.
 */
function drag(fromX: number, toX: number): void {
	const rect = clickRect()!;
	const box = svgEl.getBoundingClientRect();
	const opts = {
		bubbles: true,
		cancelable: true,
		view: window,
		button: 0,
		clientY: box.top + VIEW_H / 2
	};
	rect.dispatchEvent(new MouseEvent('mousedown', { ...opts, clientX: box.left + fromX }));
	window.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: box.left + toX }));
	window.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: box.left + toX }));
}

describe('GraphSoundRangeOverlay', () => {
	let engine: ReturnType<typeof makeEngine>;
	let overlay: GraphSoundRangeOverlay;

	beforeEach(() => {
		audioRangeStore.reset();
		audioRangeStore.isFrequencySelectionMode = false;
		engine = makeEngine();
		overlay = new GraphSoundRangeOverlay(engine as unknown as GraphEngine);
	});

	afterEach(() => {
		overlay.destroy();
		svgEl.remove();
		audioRangeStore.reset();
	});

	// ── Construction ─────────────────────────────────────────────────────────

	describe('on construction', () => {
		it('draws the band and badge', () => {
			expect(band()).not.toBeNull();
			expect(badge()).not.toBeNull();
		});

		it('starts hidden', () => {
			expect(opacityOf(band())).toBe(0);
			expect(opacityOf(badge())).toBe(0);
		});

		it('lays no click rect until range mode is entered', () => {
			// Present-but-invisible would silently swallow every EQ node drag.
			expect(clickRect()).toBeNull();
		});

		it('clips the band to the plot area', () => {
			const clip = svgEl.querySelector('#sound-range-overlay-clip rect')!;

			expect(Number(clip.getAttribute('width'))).toBe(VIEW_W - 2 * MARGIN);
			expect(Number(clip.getAttribute('height'))).toBe(VIEW_H - 2 * MARGIN);
		});

		it('spans the full plot height', () => {
			expect(Number(band().getAttribute('height'))).toBe(VIEW_H - 2 * MARGIN);
		});
	});

	// ── Activation ───────────────────────────────────────────────────────────

	describe('setActive', () => {
		it('reveals the band and badge', () => {
			overlay.setActive(true);

			expect(opacityOf(band())).toBeGreaterThan(0);
			expect(opacityOf(badge())).toBeGreaterThan(0);
		});

		it('adds the click rect', () => {
			overlay.setActive(true);

			expect(clickRect()).not.toBeNull();
		});

		it('hides everything again on deactivate', () => {
			overlay.setActive(true);
			overlay.setActive(false);

			expect(opacityOf(band())).toBe(0);
			expect(opacityOf(badge())).toBe(0);
		});

		it('removes the click rect on deactivate, restoring EQ interaction', () => {
			overlay.setActive(true);
			overlay.setActive(false);

			expect(clickRect()).toBeNull();
		});

		it('is idempotent — a repeated activate leaves one click rect', () => {
			overlay.setActive(true);
			overlay.setActive(true);

			expect(svgEl.querySelectorAll('.fr-graph-sound-range-click')).toHaveLength(1);
		});

		it('keeps the click rect below the band in document order', () => {
			// It is inserted as first child so the band still paints over it.
			overlay.setActive(true);
			const kids = Array.from(svgEl.querySelector('.fr-graph-sound-range-overlay')!.children).map(
				(c) => c.getAttribute('class')
			);

			expect(kids[0]).toBe('fr-graph-sound-range-click');
		});
	});

	// ── Band geometry ────────────────────────────────────────────────────────

	describe('the band', () => {
		it('spans the stored range', () => {
			audioRangeStore.setRange(100, 1000);
			overlay.setActive(true);

			const expectedX = engine.xScale(100);
			expect(Number(band().getAttribute('x'))).toBeCloseTo(expectedX, 3);
			expect(Number(band().getAttribute('width'))).toBeCloseTo(engine.xScale(1000) - expectedX, 3);
		});

		it('tracks a range change on re-render', () => {
			overlay.setActive(true);
			audioRangeStore.setRange(2000, 4000);
			overlay.render();

			expect(Number(band().getAttribute('x'))).toBeCloseTo(engine.xScale(2000), 3);
		});

		it('keeps a visible minimum width for a hair-thin range', () => {
			// `setRange` guarantees at least 1 Hz of separation, which near 20 Hz is
			// well under a pixel — the band would otherwise vanish.
			audioRangeStore.setRange(20, 20);
			overlay.setActive(true);

			expect(Number(band().getAttribute('width'))).toBeGreaterThanOrEqual(2);
		});
	});

	// ── Drag to set ──────────────────────────────────────────────────────────

	describe('drag to set the range', () => {
		beforeEach(() => {
			overlay.setActive(true);
		});

		it('writes the dragged span into the store', () => {
			drag(100, 400);

			// `setRange` stores whole Hz, so the endpoints are the rounded inverses.
			expect(audioRangeStore.fromHz).toBe(Math.round(engine.xScale.invert(100)));
			expect(audioRangeStore.toHz).toBe(Math.round(engine.xScale.invert(400)));
		});

		it('normalizes a right-to-left drag', () => {
			drag(400, 100);

			expect(audioRangeStore.fromHz).toBe(Math.round(engine.xScale.invert(100)));
			expect(audioRangeStore.toHz).toBe(Math.round(engine.xScale.invert(400)));
		});

		it('redraws the band to match the drag', () => {
			drag(100, 400);

			// Within a pixel — the stored Hz are rounded, which nudges x slightly.
			expect(Number(band().getAttribute('x'))).toBeGreaterThan(99);
			expect(Number(band().getAttribute('x'))).toBeLessThan(101);
		});

		it('leaves the range alone on a stray click', () => {
			// Under the 3px threshold a press-release is a click, not a selection —
			// otherwise clicking the graph would collapse the band to nothing. The
			// jitter has to be ignored mid-drag too, not just at the end: `end`
			// declining to commit does not undo what `drag` already wrote.
			audioRangeStore.setRange(200, 2000);

			drag(300, 301);

			expect(audioRangeStore.fromHz).toBe(200);
			expect(audioRangeStore.toHz).toBe(2000);
		});

		it('still tracks the range live once a drag clears the threshold', () => {
			// The threshold must not swallow real drags — the band follows the
			// pointer while the mouse is still down.
			const rect = clickRect()!;
			const box = svgEl.getBoundingClientRect();
			const opts = {
				bubbles: true,
				cancelable: true,
				view: window,
				button: 0,
				clientY: box.top + 200
			};
			rect.dispatchEvent(new MouseEvent('mousedown', { ...opts, clientX: box.left + 100 }));
			window.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: box.left + 400 }));

			expect(audioRangeStore.fromHz).toBe(Math.round(engine.xScale.invert(100)));

			window.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: box.left + 400 }));
		});
	});

	// ── Teardown ─────────────────────────────────────────────────────────────

	describe('destroy', () => {
		it('removes the overlay group and its clip path', () => {
			overlay.setActive(true);
			overlay.destroy();

			expect(svgEl.querySelector('.fr-graph-sound-range-clip-wrapper')).toBeNull();
			expect(svgEl.querySelector('#sound-range-overlay-clip')).toBeNull();

			// The afterEach destroy must stay safe to call twice.
			overlay.destroy();
		});
	});
});
