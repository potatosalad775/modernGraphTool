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

	// Decay detection: stop rendering after sustained silence
	private silentFrames = 0;
	private static readonly SILENT_THRESHOLD = 30; // ~0.5s at 60fps

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;

		this.overlayGroup = graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-spectrum-overlay');

		this.spectrumPath = this.overlayGroup
			.append('path')
			.attr('fill', 'var(--color-base-content)')
			.attr('opacity', 0.07)
			.style('pointer-events', 'none');

		this._applyClip();
		graphEngine.orderOverlayLayers();
	}

	/** Start the rendering loop with a given AnalyserNode */
	start(analyserNode: AnalyserNode): void {
		// If already running with the same node, skip
		if (this.analyserNode === analyserNode && this.rafId !== null) return;

		this.analyserNode = analyserNode;
		this.dataArray = new Uint8Array(analyserNode.frequencyBinCount);
		this.silentFrames = 0;

		this._computeMapping();

		if (this.rafId === null) {
			this._tick();
		}
	}

	/** Stop the rendering loop (allows natural decay) */
	stop(): void {
		// Don't clear immediately — let the AnalyserNode's smoothing decay naturally.
		// The rAF loop will self-terminate after SILENT_THRESHOLD silent frames.
		// But if there's no analyser at all, clear immediately.
		if (!this.analyserNode) {
			this._cancelRaf();
			this.spectrumPath.attr('d', null);
		}
		// Otherwise the loop keeps running and will detect silence + clear itself
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
		this.analyserNode = null;
		this.dataArray = null;
	}

	/** Clear analyser reference (triggers decay-to-silence then cleanup) */
	clearAnalyser(): void {
		this.analyserNode = null;
		this.dataArray = null;
	}

	// ── Private helpers ──────────────────────────────────────────────────────

	private _applyClip(): void {
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;
		this.spectrumPath.attr(
			'clip-path',
			`polygon(${xStart}px ${yTop}px, ${xEnd}px ${yTop}px, ${xEnd}px ${yBottom}px, ${xStart}px ${yBottom}px)`
		);
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

	/** The rAF rendering callback */
	private _tick = (): void => {
		this.rafId = requestAnimationFrame(this._tick);

		if (!this.dataArray || this.binIndices.length === 0) {
			return;
		}

		// If analyser was cleared (audio stopped), read decaying data
		if (this.analyserNode) {
			this.analyserNode.getByteFrequencyData(this.dataArray);
		} else {
			// No analyser — data stays as last read, but we fade by zeroing
			// Actually with no analyser we can't read new data, so just count silence
			this.silentFrames++;
			if (this.silentFrames >= GraphSpectrumOverlay.SILENT_THRESHOLD) {
				this._cancelRaf();
				this.spectrumPath.attr('d', null);
				this.dataArray = null;
				return;
			}
			// Manually decay the existing data
			for (let i = 0; i < this.dataArray.length; i++) {
				this.dataArray[i] = Math.floor(this.dataArray[i] * 0.85);
			}
		}

		// Check if all data is near-zero (silence)
		let maxVal = 0;
		for (let i = 0; i < this.binIndices.length; i++) {
			const val = this.dataArray[this.binIndices[i]];
			if (val > maxVal) maxVal = val;
		}

		if (maxVal < 2) {
			this.silentFrames++;
			if (this.silentFrames >= GraphSpectrumOverlay.SILENT_THRESHOLD) {
				this._cancelRaf();
				this.spectrumPath.attr('d', null);
				return;
			}
		} else {
			this.silentFrames = 0;
		}

		// Build SVG path: area from bottom up to spectrum magnitude
		const { yTop, yBottom } = this.graphEngine.graphGeometry;
		const yRange = yBottom - yTop;

		const points: [number, number][] = [];
		for (let i = 0; i < this.binIndices.length; i++) {
			const magnitude = this.dataArray[this.binIndices[i]] / 255;
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
