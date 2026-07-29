/**
 * `GraphSpectrumOverlay` paints the live audio spectrum behind the FR curves,
 * driven by an `AnalyserNode` and a requestAnimationFrame loop.
 *
 * `requestAnimationFrame` is stubbed so frames can be stepped deliberately —
 * a real rAF makes "did it stop?" untestable, and the loop leaking past `stop()`
 * is the failure that matters: it would keep pulling FFT data forever after the
 * player is closed.
 *
 * The analyser is a hand-rolled stand-in; Web Audio's own node cannot be
 * constructed without a running context and gives no way to inject bin values.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as d3 from 'd3';
import { GraphSpectrumOverlay } from './GraphSpectrumOverlay.js';
import type { GraphEngine } from './GraphEngine.svelte.js';

const VIEW_W = 800;
const VIEW_H = 450;
const MARGIN = 15;
const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;

let svgEl: SVGSVGElement;

function makeEngine() {
	svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svgEl.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
	const svg = d3.select(svgEl);
	svg.append('defs');
	document.body.appendChild(svgEl);

	const xScale = d3
		.scaleLog()
		.domain([20, 20000])
		.range([MARGIN, VIEW_W - MARGIN]);

	return {
		svg,
		graphGeometry: {
			xStart: MARGIN,
			xEnd: VIEW_W - MARGIN,
			yTop: MARGIN,
			yBottom: VIEW_H - MARGIN
		},
		xScale,
		getScales: () => ({ xScale, yScale: d3.scaleLinear() }),
		orderOverlayLayers: () => {}
	};
}

/** `fill` is the byte value every FFT bin reports, 0–255. */
function makeAnalyser(fill = 0): AnalyserNode {
	const binCount = FFT_SIZE / 2;
	return {
		fftSize: FFT_SIZE,
		frequencyBinCount: binCount,
		context: { sampleRate: SAMPLE_RATE },
		getByteFrequencyData: (arr: Uint8Array) => arr.fill(fill)
	} as unknown as AnalyserNode;
}

function path() {
	return svgEl.querySelector<SVGPathElement>('.fr-graph-spectrum-overlay path')!;
}

/** Parsed y-coordinates from the area path's `d`, so assertions dodge rounding. */
function pathYs(): number[] {
	const d = path().getAttribute('d') ?? '';
	return Array.from(d.matchAll(/[-\d.]+,([-\d.]+)/g)).map((mm) => Number(mm[1]));
}

describe('GraphSpectrumOverlay', () => {
	let engine: ReturnType<typeof makeEngine>;
	let overlay: GraphSpectrumOverlay;
	let frames: FrameRequestCallback[];
	let cancelled: number[];

	/** Runs exactly one queued frame. */
	function step(): void {
		const next = frames.shift();
		next?.(performance.now());
	}

	beforeEach(() => {
		frames = [];
		cancelled = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			frames.push(cb);
			return frames.length;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			cancelled.push(id);
			frames = [];
		});
		engine = makeEngine();
		overlay = new GraphSpectrumOverlay(engine as unknown as GraphEngine);
	});

	afterEach(() => {
		overlay.destroy();
		svgEl.remove();
		vi.unstubAllGlobals();
	});

	// ── Construction ─────────────────────────────────────────────────────────

	describe('on construction', () => {
		it('adds a clipped overlay group with an empty path', () => {
			expect(svgEl.querySelector('.fr-graph-spectrum-overlay')).not.toBeNull();
			expect(path().getAttribute('d')).toBeNull();
		});

		it('clips to the plot area', () => {
			const clip = svgEl.querySelector('#spectrum-overlay-clip rect')!;

			expect(Number(clip.getAttribute('width'))).toBe(VIEW_W - 2 * MARGIN);
		});

		it('ignores pointer events so it cannot steal graph interaction', () => {
			expect(path().style.pointerEvents).toBe('none');
		});

		it('queues no frames before start', () => {
			expect(frames).toHaveLength(0);
		});
	});

	// ── The render loop ──────────────────────────────────────────────────────

	describe('start', () => {
		it('begins the frame loop', () => {
			overlay.start(makeAnalyser());

			expect(frames).toHaveLength(1);
		});

		it('keeps the loop alive across frames', () => {
			overlay.start(makeAnalyser());
			step();

			expect(frames).toHaveLength(1);
		});

		it('draws a path once a frame runs', () => {
			overlay.start(makeAnalyser(128));
			step();

			expect(path().getAttribute('d')).toBeTruthy();
		});

		it('does not restart the loop for the same analyser', () => {
			// A second `start` with the same node would otherwise stack a second rAF
			// chain, doubling the work every frame and orphaning the first.
			const analyser = makeAnalyser();
			overlay.start(analyser);
			overlay.start(analyser);

			expect(frames).toHaveLength(1);
		});

		it('switches to a new analyser without stacking loops', () => {
			overlay.start(makeAnalyser(10));
			overlay.start(makeAnalyser(200));

			expect(frames).toHaveLength(1);
		});
	});

	// ── Magnitude mapping ────────────────────────────────────────────────────

	describe('the drawn spectrum', () => {
		it('sits on the bottom edge when every bin is silent', () => {
			overlay.start(makeAnalyser(0));
			step();

			// An area path's y1 points come first, y0 (the baseline) after; with zero
			// magnitude they coincide at the bottom of the plot.
			expect(Math.max(...pathYs())).toBeCloseTo(VIEW_H - MARGIN, 3);
			expect(Math.min(...pathYs())).toBeCloseTo(VIEW_H - MARGIN, 3);
		});

		it('reaches the top of the plot at full scale', () => {
			overlay.start(makeAnalyser(255));
			step();

			expect(Math.min(...pathYs())).toBeCloseTo(MARGIN, 3);
		});

		it('lands mid-plot for a half-scale reading', () => {
			overlay.start(makeAnalyser(128));
			step();

			const yRange = VIEW_H - 2 * MARGIN;
			expect(Math.min(...pathYs())).toBeCloseTo(VIEW_H - MARGIN - (128 / 255) * yRange, 1);
		});

		it('redraws as the analyser data changes', () => {
			const analyser = makeAnalyser(0);
			overlay.start(analyser);
			step();
			const quiet = path().getAttribute('d');

			overlay.start(makeAnalyser(200));
			step();

			expect(path().getAttribute('d')).not.toBe(quiet);
		});
	});

	// ── Stopping ─────────────────────────────────────────────────────────────

	describe('stop', () => {
		it('cancels the frame loop', () => {
			overlay.start(makeAnalyser(128));
			overlay.stop();

			expect(cancelled).toHaveLength(1);
			expect(frames).toHaveLength(0);
		});

		it('clears the drawn path', () => {
			overlay.start(makeAnalyser(128));
			step();
			overlay.stop();

			expect(path().getAttribute('d')).toBeNull();
		});

		it('is safe to call without a running loop', () => {
			overlay.stop();

			expect(path().getAttribute('d')).toBeNull();
		});

		it('can be started again afterwards', () => {
			overlay.start(makeAnalyser(128));
			overlay.stop();
			overlay.start(makeAnalyser(128));
			step();

			expect(path().getAttribute('d')).toBeTruthy();
		});
	});

	// ── Scales and teardown ──────────────────────────────────────────────────

	describe('updateScales', () => {
		it('re-clips to the current geometry', () => {
			engine.graphGeometry.xEnd = 600;
			overlay.updateScales();

			const clip = svgEl.querySelector('#spectrum-overlay-clip rect')!;
			expect(Number(clip.getAttribute('width'))).toBe(600 - MARGIN);
		});

		it('is safe before any mapping has been computed', () => {
			overlay.updateScales();

			expect(path().getAttribute('d')).toBeNull();
		});
	});

	describe('destroy', () => {
		it('cancels the loop and removes its SVG', () => {
			overlay.start(makeAnalyser(128));
			overlay.destroy();

			expect(cancelled).toHaveLength(1);
			expect(svgEl.querySelector('.fr-graph-spectrum-overlay')).toBeNull();
			expect(svgEl.querySelector('#spectrum-overlay-clip')).toBeNull();
		});
	});
});
