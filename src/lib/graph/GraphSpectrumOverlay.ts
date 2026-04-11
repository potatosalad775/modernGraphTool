import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';

/**
 * GraphSpectrumOverlay — renders a real-time FFT spectrum of the audio player
 * as a muted filled area in the background of the FR graph.
 *
 * Sits behind FR curves but above axes/watermarks. Uses the Web Audio
 * AnalyserNode's getByteFrequencyData() for efficient per-frame updates.
 */
export class GraphSpectrumOverlay {
	private graphEngine: GraphEngine;
	private overlayGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	private spectrumPath: d3.Selection<SVGPathElement, unknown, null, undefined>;

	private analyserNode: AnalyserNode | null = null;
	private dataArray: Uint8Array<ArrayBuffer> | null = null;
	private rafId: number | null = null;

	// Pre-computed mapping: log-spaced frequencies → FFT bin indices → SVG x-coords
	private freqs: number[] = [];
	private binIndices: number[] = [];
	private xCoords: number[] = [];

	private static readonly MAX_MAGNITUDE = 1;

	private clipRect!: d3.Selection<SVGRectElement, unknown, null, undefined>;

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;

		// Create SVG clipPath in defs
		const clipId = 'spectrum-overlay-clip';
		const defs = graphEngine.svg.select<SVGDefsElement>('defs');
		const { xStart, xEnd, yTop, yBottom } = graphEngine.graphGeometry;

		this.clipRect = defs
			.append('clipPath')
			.attr('id', clipId)
			.append('rect')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop);

		this.overlayGroup = graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-spectrum-overlay')
			.attr('clip-path', `url(#${clipId})`);

		this.spectrumPath = this.overlayGroup
			.append('path')
			.attr('fill', 'var(--color-base-content)')
			.attr('opacity', 0.07)
			.style('pointer-events', 'none');

		graphEngine.orderOverlayLayers();
	}

	/** Start the rendering loop with a given AnalyserNode */
	start(analyserNode: AnalyserNode): void {
		// If already running with the same node, skip
		if (this.analyserNode === analyserNode && this.rafId !== null) return;

		this.analyserNode = analyserNode;
		this.dataArray = new Uint8Array(analyserNode.frequencyBinCount);

		this._computeMapping();

		if (this.rafId === null) {
			this._tick();
		}
	}

	/** Stop the rendering loop and clear the path */
	stop(): void {
		this._cancelRaf();
		this.spectrumPath.attr('d', null);
		this.analyserNode = null;
		this.dataArray = null;
	}

	/** Recompute x-coordinates when graph scales change */
	updateScales(): void {
		if (this.freqs.length > 0) {
			const { xScale } = this.graphEngine.getScales();
			this.xCoords = this.freqs.map((f) => xScale(f));
		}
		this._applyClip();
	}

	/** Clean up SVG elements and cancel animation */
	destroy(): void {
		this._cancelRaf();
		this.overlayGroup.remove();
		this.graphEngine.svg.select('#spectrum-overlay-clip').remove();
		this.analyserNode = null;
		this.dataArray = null;
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	private _applyClip(): void {
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;
		this.clipRect
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop);
	}

	/**
	 * Pre-compute the log-spaced frequency → FFT bin → SVG x-coordinate mapping.
	 * Called once when start() is invoked or when the analyser changes.
	 */
	private _computeMapping(): void {
		if (!this.analyserNode) return;

		const sampleRate = this.analyserNode.context.sampleRate;
		const fftSize = this.analyserNode.fftSize;
		const binCount = this.analyserNode.frequencyBinCount;
		const { xScale } = this.graphEngine.getScales();

		const minF = 20;
		const maxF = 20000;
		const numPoints = 200;

		this.freqs = [];
		this.binIndices = [];
		this.xCoords = [];

		for (let i = 0; i <= numPoints; i++) {
			const freq = minF * Math.pow(maxF / minF, i / numPoints);
			const bin = Math.round((freq * fftSize) / sampleRate);
			if (bin >= binCount) break;

			this.freqs.push(freq);
			this.binIndices.push(bin);
			this.xCoords.push(xScale(freq));
		}
	}

	/** The rAF rendering callback — runs continuously while the spectrum checkbox is on */
	private _tick = (): void => {
		this.rafId = requestAnimationFrame(this._tick);

		if (!this.analyserNode || !this.dataArray || this.binIndices.length === 0) {
			return;
		}

		this.analyserNode.getByteFrequencyData(this.dataArray);

		// Build SVG path: area from bottom up to spectrum magnitude
		const { yTop, yBottom } = this.graphEngine.graphGeometry;
		const yRange = yBottom - yTop;

		const points: [number, number][] = [];
		for (let i = 0; i < this.binIndices.length; i++) {
			const magnitude = Math.min(
				this.dataArray[this.binIndices[i]] / 255,
				GraphSpectrumOverlay.MAX_MAGNITUDE
			);
			const y = yBottom - magnitude * yRange;
			points.push([this.xCoords[i], y]);
		}

		// Use d3 area generator with monotone interpolation for smooth curves
		const areaGenerator = d3
			.area<[number, number]>()
			.x((d) => d[0])
			.y0(yBottom)
			.y1((d) => d[1])
			.curve(d3.curveMonotoneX);

		this.spectrumPath.attr('d', areaGenerator(points));
	};

	private _cancelRaf(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}
}
