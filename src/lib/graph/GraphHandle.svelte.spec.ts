/**
 * `GraphHandle` is the Y-axis pan handle on the right edge. A drag moves the handle
 * at once but redraws the graph in an animation frame, so a burst of drag events
 * costs one redraw, and the release position is always drawn.
 *
 * `requestAnimationFrame` is stubbed so frames are stepped deliberately. d3-drag v3
 * binds `mousedown` and registers move/up on `event.view`, so the helpers dispatch
 * MouseEvents built with `view: window` (see graph/AGENTS.md).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as d3 from 'd3';
import GraphHandle from './GraphHandle.js';
import type { GraphEngine } from './GraphEngine.svelte.js';

const GEOMETRY = { xStart: 15, xEnd: 785, yTop: 15, yBottom: 435 };

let svgEl: SVGSVGElement;

function makeEngine() {
	svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svgEl.setAttribute('width', '800');
	svgEl.setAttribute('height', '450');
	document.body.appendChild(svgEl);

	const engine = {
		svg: d3.select(svgEl),
		graphGeometry: GEOMETRY,
		yScaleValue: 40,
		yScale: d3.scaleLinear(),
		baseYScale: d3.scaleLinear(),
		updateYAxis: vi.fn(),
		repositionCurves: vi.fn()
	};
	return engine;
}

describe('GraphHandle', () => {
	let engine: ReturnType<typeof makeEngine>;
	let handle: GraphHandle;
	let circle: SVGCircleElement;
	let frames: { id: number; cb: FrameRequestCallback }[];
	let cancelled: number[];
	let nextId: number;

	function runFrames() {
		const due = frames;
		frames = [];
		for (const f of due) f.cb(performance.now());
	}

	function opts(y: number) {
		const box = svgEl.getBoundingClientRect();
		return {
			bubbles: true,
			cancelable: true,
			view: window,
			button: 0,
			clientX: box.left + GEOMETRY.xEnd,
			clientY: box.top + y
		};
	}

	const press = (y: number) => circle.dispatchEvent(new MouseEvent('mousedown', opts(y)));
	const moveTo = (y: number) => window.dispatchEvent(new MouseEvent('mousemove', opts(y)));
	const release = (y: number) => window.dispatchEvent(new MouseEvent('mouseup', opts(y)));

	/** The domain minimum the engine's y scale was last given. */
	const domainMin = () => engine.yScale.domain()[0];

	beforeEach(() => {
		frames = [];
		cancelled = [];
		nextId = 1;
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			const id = nextId++;
			frames.push({ id, cb });
			return id;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			cancelled.push(id);
			frames = frames.filter((f) => f.id !== id);
		});
		engine = makeEngine();
		handle = new GraphHandle(engine.svg, engine as unknown as GraphEngine, false);
		circle = svgEl.querySelector('circle')!;
	});

	afterEach(() => {
		svgEl.remove();
		vi.unstubAllGlobals();
	});

	it('moves the handle at once but leaves the graph for the frame', () => {
		press(handle.centerY);
		moveTo(handle.maxY);

		expect(Number(circle.getAttribute('cy'))).toBeCloseTo(handle.maxY, 3);
		expect(handle.yShift).toBeCloseTo(handle.maxShift, 3);
		expect(engine.repositionCurves).not.toHaveBeenCalled();
		expect(frames).toHaveLength(1);

		runFrames();
		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);
		expect(engine.updateYAxis).toHaveBeenCalledWith(null, false);

		release(handle.maxY);
	});

	it('redraws once for many drag events in a frame, at the last position', () => {
		press(handle.centerY);
		moveTo(handle.centerY + 40);
		moveTo(handle.centerY + 80);
		moveTo(handle.maxY);

		expect(frames).toHaveLength(1);
		runFrames();

		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);
		// Shifted by the full maxShift: the domain moved by +20 dB from -20.
		expect(domainMin()).toBeCloseTo(-20 + handle.maxShift, 3);

		release(handle.maxY);
	});

	it('flushes the final position on drag end without waiting for the frame', () => {
		press(handle.centerY);
		moveTo(handle.maxY);
		expect(engine.repositionCurves).not.toHaveBeenCalled();

		release(handle.maxY);

		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);
		expect(domainMin()).toBeCloseTo(-20 + handle.maxShift, 3);
		// The frame it replaced is gone, so it cannot draw the same state twice.
		expect(frames).toHaveLength(0);
		runFrames();
		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);
	});

	it('draws nothing extra when the drag ends with no redraw pending', () => {
		press(handle.centerY);
		moveTo(handle.maxY);
		runFrames();
		release(handle.maxY);

		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);
	});

	it('resets synchronously, and drops a pending drag frame', () => {
		press(handle.centerY);
		moveTo(handle.maxY);
		release(handle.maxY);
		engine.repositionCurves.mockClear();

		press(handle.centerY);
		moveTo(handle.minY);
		expect(frames).toHaveLength(1);

		handle.resetHandle();

		expect(handle.yShift).toBe(0);
		expect(Number(circle.getAttribute('cy'))).toBe(handle.centerY);
		expect(domainMin()).toBeCloseTo(-20, 3);
		expect(frames).toHaveLength(0);
		expect(engine.repositionCurves).toHaveBeenCalledTimes(1);

		release(handle.centerY);
	});
});
