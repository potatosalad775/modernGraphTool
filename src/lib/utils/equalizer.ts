/**
 * Equalizer utility — biquad filter math + AutoEQ algorithm.
 * Ported from legacy src/features/equalizer/util/equalizer.ts
 */

export interface EQFilter {
	enabled: boolean;
	type: 'PK' | 'LSQ' | 'HSQ';
	freq: number | null;
	q: number | null;
	gain: number | null;
}

type FreqPoint = [number, number];

interface EqualizerConfig {
	DefaultSampleRate: number;
	TrebleStartFrom: number;
	AutoEQRange: [number, number];
	OptimizeQRange: [number, number];
	OptimizeGainRange: [number, number];
	OptimizeDeltas: [number, number, number, number, number, number][];
	GraphicEQRawFrequences: number[];
	GraphicEQFrequences: number[];
}

interface AutoEQOptions {
	maxFilters?: number;
	freqRange?: [number, number];
	qRange?: [number, number];
	gainRange?: [number, number];
	useShelfFilter?: boolean;
}

export class Equalizer {
	config: EqualizerConfig;

	constructor() {
		this.config = {
			DefaultSampleRate: 48000,
			TrebleStartFrom: 7000,
			AutoEQRange: [20, 15000],
			OptimizeQRange: [0.5, 2],
			OptimizeGainRange: [-12, 12],
			OptimizeDeltas: [
				[10, 10, 10, 5, 0.1, 0.5],
				[10, 10, 10, 2, 0.1, 0.2],
				[10, 10, 10, 1, 0.1, 0.1]
			],
			GraphicEQRawFrequences: new Array(Math.ceil(Math.log(20000 / 20) / Math.log(1.0072)))
				.fill(null)
				.map((_: null, i: number) => 20 * Math.pow(1.0072, i)),
			GraphicEQFrequences: Array.from(
				new Set(
					new Array(Math.ceil(Math.log(20000 / 20) / Math.log(1.0563)))
						.fill(null)
						.map((_: null, i: number) => Math.floor(20 * Math.pow(1.0563, i)))
				)
			).sort((a: number, b: number) => a - b)
		};
	}

	_interpolate(fv: number[], fr: FreqPoint[]): FreqPoint[] {
		let i = 0;
		return fv.map((f) => {
			for (; i < fr.length - 1; ++i) {
				const [f0, v0] = fr[i];
				const [f1, v1] = fr[i + 1];
				if (i == 0 && f < f0) {
					return [f, v0];
				} else if (f >= f0 && f < f1) {
					const v = v0 + ((v1 - v0) * (f - f0)) / (f1 - f0);
					return [f, v];
				}
			}
			return [f, fr[fr.length - 1][1]];
		});
	}

	_lowshelf(freq: number, q: number, gain: number): number[] {
		freq = freq / this.config.DefaultSampleRate;
		freq = Math.max(1e-6, Math.min(freq, 1));
		q = Math.max(1e-4, Math.min(q, 1000));
		gain = Math.max(-40, Math.min(gain, 40));

		const w0 = 2 * Math.PI * freq;
		const sin = Math.sin(w0);
		const cos = Math.cos(w0);
		const a = Math.pow(10, gain / 40);
		const alpha = sin / (2 * q);
		const alphamod = 2 * Math.sqrt(a) * alpha || 0;

		const a0 = a + 1 + (a - 1) * cos + alphamod;
		const a1 = -2 * (a - 1 + (a + 1) * cos);
		const a2 = a + 1 + (a - 1) * cos - alphamod;
		const b0 = a * (a + 1 - (a - 1) * cos + alphamod);
		const b1 = 2 * a * (a - 1 - (a + 1) * cos);
		const b2 = a * (a + 1 - (a - 1) * cos - alphamod);

		return [1.0, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
	}

	_highshelf(freq: number, q: number, gain: number): number[] {
		freq = freq / this.config.DefaultSampleRate;
		freq = Math.max(1e-6, Math.min(freq, 1));
		q = Math.max(1e-4, Math.min(q, 1000));
		gain = Math.max(-40, Math.min(gain, 40));

		const w0 = 2 * Math.PI * freq;
		const sin = Math.sin(w0);
		const cos = Math.cos(w0);
		const a = Math.pow(10, gain / 40);
		const alpha = sin / (2 * q);
		const alphamod = 2 * Math.sqrt(a) * alpha || 0;

		const a0 = a + 1 - (a - 1) * cos + alphamod;
		const a1 = 2 * (a - 1 - (a + 1) * cos);
		const a2 = a + 1 - (a - 1) * cos - alphamod;
		const b0 = a * (a + 1 + (a - 1) * cos + alphamod);
		const b1 = -2 * a * (a - 1 + (a + 1) * cos);
		const b2 = a * (a + 1 + (a - 1) * cos - alphamod);

		return [1.0, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
	}

	_peaking(freq: number, q: number, gain: number): number[] {
		freq = freq / this.config.DefaultSampleRate;
		freq = Math.max(1e-6, Math.min(freq, 1));
		q = Math.max(1e-4, Math.min(q, 1000));
		gain = Math.max(-40, Math.min(gain, 40));

		const w0 = 2 * Math.PI * freq;
		const sin = Math.sin(w0);
		const cos = Math.cos(w0);
		const alpha = sin / (2 * q);
		const a = Math.pow(10, gain / 40);

		const a0 = 1 + alpha / a;
		const a1 = -2 * cos;
		const a2 = 1 - alpha / a;
		const b0 = 1 + alpha * a;
		const b1 = -2 * cos;
		const b2 = 1 - alpha * a;

		return [1.0, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
	}

	_calculateGains(freqs: number[], coeffs: number[][]): number[] {
		const n = freqs.length;
		const gains = new Array(n).fill(0);
		if (coeffs.length === 0) return gains;

		const wScale = (2 * Math.PI) / this.config.DefaultSampleRate;
		const phi = new Float64Array(n);
		for (let j = 0; j < n; ++j) {
			const s = Math.sin((freqs[j] * wScale) / 2);
			phi[j] = 4 * s * s;
		}

		const inv10ln10 = 10 / Math.LN10;

		for (let i = 0; i < coeffs.length; ++i) {
			const [a0, a1, a2, b0, b1, b2] = coeffs[i];
			const bSum = b0 + b1 + b2;
			const aSum = a0 + a1 + a2;
			const bSum2 = bSum * bSum;
			const aSum2 = aSum * aSum;
			const bQuad = b0 * b2;
			const aQuad = a0 * a2;
			const bLinear = -(b1 * (b0 + b2) + 4 * bQuad);
			const aLinear = -(a1 * (a0 + a2) + 4 * aQuad);

			for (let j = 0; j < n; ++j) {
				const p = phi[j];
				const num = bSum2 + (bLinear + bQuad * p) * p;
				const den = aSum2 + (aLinear + aQuad * p) * p;
				gains[j] += inv10ln10 * Math.log(num / den);
			}
		}
		return gains;
	}

	calculateGainsFromFilter(freqs: number[], filters: EQFilter[]): number[] {
		const coeffs = this._filtersToCoeffs(filters);
		return this._calculateGains(freqs, coeffs);
	}

	calculatePreamp(source: FreqPoint[], filters: EQFilter[]): number {
		const fr2 = this.applyFilters(source, filters);
		let maxGain = -Infinity;
		for (let i = 0; i < source.length; ++i) {
			maxGain = Math.max(maxGain, fr2[i][1] - source[i][1]);
		}
		return -maxGain;
	}

	_calculateDistance(fr1: FreqPoint[], fr2: FreqPoint[]): number {
		let distance = 0;
		for (let i = 0; i < fr1.length; ++i) {
			const d = Math.abs(fr1[i][1] - fr2[i][1]);
			distance += d >= 0.1 ? d : 0;
		}
		return distance / fr1.length;
	}

	_filtersToCoeffs(filters: EQFilter[]): number[][] {
		return filters
			.map((f) => {
				if (!f.freq || !f.gain || !f.q) {
					return null;
				} else if (f.type === 'LSQ') {
					return this._lowshelf(f.freq, f.q, f.gain);
				} else if (f.type === 'HSQ') {
					return this._highshelf(f.freq, f.q, f.gain);
				} else if (f.type === 'PK') {
					return this._peaking(f.freq, f.q, f.gain);
				}
				return null;
			})
			.filter((f): f is number[] => f !== null);
	}

	_normalizeResolution(
		source: FreqPoint[],
		target: FreqPoint[]
	): { source: FreqPoint[]; target: FreqPoint[] } {
		const frequencies: number[] = [20];
		const step = Math.pow(2, 1 / 48);
		while (frequencies[frequencies.length - 1] < 20000) {
			frequencies.push(frequencies[frequencies.length - 1] * step);
		}

		const normalizedSource = this._interpolatePoints(frequencies, source);
		const normalizedTarget = this._interpolatePoints(frequencies, target);

		const refFreq = 1000;
		const sourceRefIdx = frequencies.findIndex((f) => f >= refFreq);

		const offset = normalizedSource[sourceRefIdx][1] - normalizedTarget[sourceRefIdx][1];
		const alignedTarget = normalizedTarget.map(
			(point) => [point[0], point[1] + offset] as FreqPoint
		);

		return { source: normalizedSource, target: alignedTarget };
	}

	_interpolatePoints(freqs: number[], points: FreqPoint[]): FreqPoint[] {
		if (!points || points.length === 0) return freqs.map((f) => [f, 0]);

		const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);

		return freqs.map((f) => {
			let i = 0;
			while (i < sortedPoints.length - 1 && sortedPoints[i + 1][0] < f) {
				i++;
			}

			if (i >= sortedPoints.length - 1) {
				return [f, sortedPoints[sortedPoints.length - 1][1]];
			} else if (i < 0 || f <= sortedPoints[0][0]) {
				return [f, sortedPoints[0][1]];
			} else {
				const [f0, v0] = sortedPoints[i];
				const [f1, v1] = sortedPoints[i + 1];
				const ratio = Math.log(f / f0) / Math.log(f1 / f0);
				const v = v0 + ratio * (v1 - v0);
				return [f, v];
			}
		});
	}

	applyFilters(fr: FreqPoint[], filters: EQFilter[]): FreqPoint[] {
		const freqs = fr.map((p) => p[0]);
		const coeffs = this._filtersToCoeffs(filters);
		const gains = this._calculateGains(freqs, coeffs);
		return freqs.map((f, i) => [f, fr[i][1] + gains[i]]);
	}

	_searchCandidates(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		threshold: number
	): Partial<EQFilter>[] {
		let state = 0;
		let startIndex = -1;
		const candidates: Partial<EQFilter>[] = [];
		const [minFreq, maxFreq] = this.config.AutoEQRange;

		for (let i = 0; i < fr.length; ++i) {
			const [f, v0] = fr[i];
			const v1 = frTarget[i][1];
			const delta = v0 - v1;
			const deltaAbs = Math.abs(delta);
			const nextState = deltaAbs < threshold ? 0 : delta / deltaAbs;

			if (nextState === state) continue;

			if (startIndex >= 0) {
				if (state != 0) {
					const start = fr[startIndex][0];
					const end = f;
					const center = Math.sqrt(start * end);
					const gain =
						this._interpolate([center], frTarget.slice(startIndex, i))[0][1] -
						this._interpolate([center], fr.slice(startIndex, i))[0][1];
					const q = center / (end - start);
					if (center >= minFreq && center <= maxFreq) {
						candidates.push({ type: 'PK', freq: center, q, gain });
					}
				}
				startIndex = -1;
			} else {
				startIndex = i;
			}
			state = nextState;
		}
		return candidates;
	}

	_freqUnit(freq: number): number {
		if (freq < 100) return 1;
		if (freq < 1000) return 10;
		if (freq < 10000) return 100;
		return 1000;
	}

	_round(value: number, decimals = 1): number {
		const factor = Math.pow(10, decimals);
		return Math.round(value * factor) / factor;
	}

	_stripFilters(filters: EQFilter[]): EQFilter[] {
		const [minQ, maxQ] = this.config.OptimizeQRange;
		const [minGain, maxGain] = this.config.OptimizeGainRange;
		return filters.map((f) => ({
			enabled: f.enabled,
			type: f.type,
			freq: Math.floor(f.freq! - (f.freq! % this._freqUnit(f.freq!))),
			q: Math.min(Math.max(f.q!, minQ), maxQ),
			gain: Math.min(Math.max(f.gain!, minGain), maxGain)
		}));
	}

	convertFilterAsGraphicEQ(filters: EQFilter[]): FreqPoint[] {
		const rawFreq = this.config.GraphicEQRawFrequences;
		const eqFreq = this.config.GraphicEQFrequences;
		const coeffs = this._filtersToCoeffs(filters);
		const gains = this._calculateGains(rawFreq, coeffs);
		const rawFR = rawFreq.map((f, i) => [f, gains[i]] as FreqPoint);
		let i = 0;
		const resultFR: FreqPoint[] = eqFreq.map((f, j) => {
			const freqTo = j < eqFreq.length - 1 ? Math.sqrt(f * eqFreq[j + 1]) : 20000;
			const points: number[] = [];
			for (; i < rawFreq.length; ++i) {
				if (rawFreq[i] < freqTo) {
					points.push(rawFR[i][1]);
				} else {
					break;
				}
			}
			const avg = points.reduce((a, b) => a + b, 0) / points.length;
			return [f, avg];
		});
		const maxGain = resultFR.reduce((a, b) => (a > b[1] ? a : b[1]), -Infinity);
		return resultFR.map(([f, v]) => [f, v - maxGain]);
	}

	_optimize(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		filters: EQFilter[],
		iteration: number,
		dir = false
	): EQFilter[] {
		filters = this._stripFilters(filters);

		const [minFreq, maxFreq] = this.config.AutoEQRange;
		const [minQ, maxQ] = this.config.OptimizeQRange;
		const [minGain, maxGain] = this.config.OptimizeGainRange;
		const [maxDF, maxDQ, maxDG, stepDF, stepDQ, stepDG] = this.config.OptimizeDeltas[iteration];
		const [begin, end, step] = dir ? [filters.length - 1, -1, -1] : [0, filters.length, 1];

		for (let i = begin; i != end; i += step) {
			let f = filters[i];
			const fr1 = this.applyFilters(
				fr,
				filters.filter((_f, fi) => fi !== i)
			);
			let bestFilter = f;
			let bestDistance = this._calculateDistance(this.applyFilters(fr1, [f]), frTarget);

			const isShelfFilter = f.type === 'LSQ' || f.type === 'HSQ';
			const effectiveMinFreq = isShelfFilter ? (f.type === 'LSQ' ? 20 : 4000) : minFreq;
			const effectiveMaxFreq = isShelfFilter ? (f.type === 'LSQ' ? 400 : 16000) : maxFreq;
			const effectiveMinQ = isShelfFilter ? 0.3 : minQ;
			const effectiveMaxQ = isShelfFilter ? 1.5 : maxQ;

			const testNewFilter = (df: number, dq: number, dg: number): boolean => {
				const freq = f.freq! + df * this._freqUnit(f.freq!) * stepDF;
				const q = f.q! + dq * stepDQ;
				const gain = f.gain! + dg * stepDG;
				if (
					freq < effectiveMinFreq ||
					freq > effectiveMaxFreq ||
					q < effectiveMinQ ||
					q > effectiveMaxQ ||
					gain < minGain ||
					gain > maxGain
				) {
					return false;
				}
				const newFilter: EQFilter = { ...f, freq, q, gain };
				const newFR = this.applyFilters(fr1, [newFilter]);
				const newDistance = this._calculateDistance(newFR, frTarget);
				if (newDistance < bestDistance) {
					bestFilter = newFilter;
					bestDistance = newDistance;
					return true;
				}
				return false;
			};

			let improved = true;
			const maxIterations = 50;
			let iterCount = 0;

			while (improved && iterCount < maxIterations) {
				improved = false;
				iterCount++;

				for (let df = -maxDF; df <= maxDF && !improved; df++) {
					if (df !== 0 && testNewFilter(df, 0, 0)) {
						f = bestFilter;
						improved = true;
					}
				}
				for (let dq = -maxDQ; dq <= maxDQ && !improved; dq++) {
					if (dq !== 0 && testNewFilter(0, dq, 0)) {
						f = bestFilter;
						improved = true;
					}
				}
				for (let dg = -maxDG; dg <= maxDG && !improved; dg++) {
					if (dg !== 0 && testNewFilter(0, 0, dg)) {
						f = bestFilter;
						improved = true;
					}
				}
			}

			for (let df = -maxDF; df <= maxDF; ++df) {
				for (let dq = maxDQ; dq >= -maxDQ; --dq) {
					for (let dg = 0; dg <= maxDG; ++dg) {
						if (!testNewFilter(df, dq, dg)) break;
					}
					for (let dg = 0; dg >= -maxDG; --dg) {
						if (!testNewFilter(df, dq, dg)) break;
					}
				}
			}
			filters[i] = bestFilter;
		}
		return filters.sort((a, b) => a.freq! - b.freq!);
	}

	_analyzeShelfOpportunities(fr: FreqPoint[], frTarget: FreqPoint[]): Partial<EQFilter>[] {
		const [minFreq, maxFreq] = this.config.AutoEQRange;
		const shelfFilters: Partial<EQFilter>[] = [];

		const lowFreqPoints = fr.filter((p) => p[0] >= minFreq && p[0] <= 200);
		const lowFreqTargetPoints = frTarget.filter((p) => p[0] >= minFreq && p[0] <= 200);

		if (lowFreqPoints.length > 0 && lowFreqTargetPoints.length > 0) {
			let totalDelta = 0;
			for (let i = 0; i < lowFreqPoints.length; i++) {
				totalDelta += lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
			}
			const avgDelta = totalDelta / lowFreqPoints.length;
			if (Math.abs(avgDelta) > 1.5) {
				let shelfFreq = 100;
				for (let i = lowFreqPoints.length - 1; i >= 0; i--) {
					const delta = lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
					if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
						shelfFreq = lowFreqPoints[i][0];
					} else {
						break;
					}
				}
				shelfFilters.push({
					type: 'LSQ',
					freq: Math.max(shelfFreq, 50),
					q: 0.7,
					gain: avgDelta
				});
			}
		}

		const highFreqPoints = fr.filter((p) => p[0] >= 8000 && p[0] <= maxFreq);
		const highFreqTargetPoints = frTarget.filter((p) => p[0] >= 8000 && p[0] <= maxFreq);

		if (highFreqPoints.length > 0 && highFreqTargetPoints.length > 0) {
			let totalDelta = 0;
			for (let i = 0; i < highFreqPoints.length; i++) {
				totalDelta += highFreqTargetPoints[i][1] - highFreqPoints[i][1];
			}
			const avgDelta = totalDelta / highFreqPoints.length;
			if (Math.abs(avgDelta) > 1.5) {
				let shelfFreq = 8000;
				for (let i = 0; i < highFreqPoints.length; i++) {
					const delta = highFreqTargetPoints[i][1] - highFreqPoints[i][1];
					if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
						shelfFreq = highFreqPoints[i][0];
						break;
					}
				}
				shelfFilters.push({
					type: 'HSQ',
					freq: Math.min(shelfFreq, 12000),
					q: 0.7,
					gain: avgDelta
				});
			}
		}

		return shelfFilters;
	}

	_calculateWeightedError(fr1: FreqPoint[], fr2: FreqPoint[]): number {
		let error = 0;
		for (let i = 0; i < fr1.length; i++) {
			const diff = Math.abs(fr1[i][1] - fr2[i][1]);
			error += diff * diff;
		}
		return Math.sqrt(error / fr1.length);
	}

	_scoreCandidates(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		candidates: Partial<EQFilter>[]
	): (Partial<EQFilter> & { score: number })[] {
		return candidates
			.map((c) => {
				const newFR = this.applyFilters(fr, [c as EQFilter]);
				const originalError = this._calculateWeightedError(fr, frTarget);
				const newError = this._calculateWeightedError(newFR, frTarget);
				return { ...c, score: originalError - newError };
			})
			.filter((c) => c.score > 0)
			.sort((a, b) => b.score - a.score);
	}

	_optimizeShelfFilter(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		filter: Partial<EQFilter>
	): EQFilter {
		const isLowShelf = filter.type === 'LSQ';
		const [minGain, maxGain] = this.config.OptimizeGainRange;

		let bestFilter: EQFilter = { enabled: true, ...filter } as EQFilter;
		let bestError = this._calculateWeightedError(this.applyFilters(fr, [bestFilter]), frTarget);

		const freqSteps = isLowShelf
			? [30, 50, 70, 100, 120, 150, 200, 250, 300]
			: [4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
		const qSteps = [0.4, 0.5, 0.6, 0.7, 0.8, 1.0, 1.2, 1.5];

		for (const freq of freqSteps) {
			for (const q of qSteps) {
				let lowGain = minGain;
				let highGain = maxGain;
				while (highGain - lowGain > 0.2) {
					const midGain = (lowGain + highGain) / 2;
					const t1: EQFilter = {
						enabled: true,
						type: filter.type!,
						freq,
						q,
						gain: midGain - 0.5
					};
					const t2: EQFilter = {
						enabled: true,
						type: filter.type!,
						freq,
						q,
						gain: midGain + 0.5
					};
					if (
						this._calculateWeightedError(this.applyFilters(fr, [t1]), frTarget) <
						this._calculateWeightedError(this.applyFilters(fr, [t2]), frTarget)
					) {
						highGain = midGain;
					} else {
						lowGain = midGain;
					}
				}
				const testFilter: EQFilter = {
					enabled: true,
					type: filter.type!,
					freq,
					q,
					gain: (lowGain + highGain) / 2
				};
				const error = this._calculateWeightedError(this.applyFilters(fr, [testFilter]), frTarget);
				if (error < bestError) {
					bestFilter = testFilter;
					bestError = error;
				}
			}
		}
		return bestFilter;
	}

	_iterativeBatchOptimization(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		initialFilters: EQFilter[],
		maxFilters: number
	): EQFilter[] {
		let filters = [...initialFilters];
		let currentFR = this.applyFilters(fr, filters);

		while (filters.length < maxFilters) {
			const candidates = this._searchCandidates(currentFR, frTarget, 0.3);
			if (candidates.length === 0) break;
			const scoredCandidates = this._scoreCandidates(currentFR, frTarget, candidates);
			if (scoredCandidates.length === 0) break;

			const best = scoredCandidates[0];
			filters.push({
				enabled: true,
				type: best.type!,
				freq: best.freq!,
				q: best.q!,
				gain: best.gain!
			});

			for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
				filters = this._optimize(fr, frTarget, filters, i);
				filters = this._optimize(fr, frTarget, filters, i, true);
			}
			currentFR = this.applyFilters(fr, filters);
			if (this._calculateWeightedError(currentFR, frTarget) < 0.5) break;
		}
		return filters;
	}

	autoEQ(source: FreqPoint[], target: FreqPoint[], options: AutoEQOptions = {}): EQFilter[] {
		const maxFilters = options.maxFilters || 8;
		const freqRange = options.freqRange || this.config.AutoEQRange;
		const qRange = options.qRange || this.config.OptimizeQRange;
		const gainRange = options.gainRange || this.config.OptimizeGainRange;
		const useShelfFilter = options.useShelfFilter !== false;

		this.config.AutoEQRange = freqRange;
		this.config.OptimizeQRange = qRange;
		this.config.OptimizeGainRange = gainRange;

		const normalizedData = this._normalizeResolution(source, target);
		const fr = normalizedData.source.filter((p) => p[0] >= freqRange[0] && p[0] <= freqRange[1]);
		const frTarget = normalizedData.target.filter(
			(p) => p[0] >= freqRange[0] && p[0] <= freqRange[1]
		);

		const initialFilters: EQFilter[] = [];
		let remainingFilterSlots = maxFilters;

		if (useShelfFilter) {
			const shelfSuggestions = this._analyzeShelfOpportunities(fr, frTarget);
			for (const shelf of shelfSuggestions) {
				if (remainingFilterSlots <= 2) break;
				const optimizedShelf = this._optimizeShelfFilter(fr, frTarget, shelf);
				const withShelf = this.applyFilters(fr, [...initialFilters, optimizedShelf]);
				const withoutShelf = this.applyFilters(fr, initialFilters);
				if (
					this._calculateWeightedError(withoutShelf, frTarget) -
						this._calculateWeightedError(withShelf, frTarget) >
					0.3
				) {
					initialFilters.push(optimizedShelf);
					remainingFilterSlots--;
				}
			}
		}

		let allFilters = this._iterativeBatchOptimization(fr, frTarget, initialFilters, maxFilters);

		for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
			allFilters = this._optimize(fr, frTarget, allFilters, i);
			allFilters = this._optimize(fr, frTarget, allFilters, i, true);
		}

		allFilters = this._pruneIneffectiveFilters(fr, frTarget, allFilters);

		return allFilters
			.map((f) => ({
				enabled: true,
				type: f.type,
				freq: this._round(f.freq!, 0),
				q: this._round(f.q!, 2),
				gain: this._round(f.gain!, 1)
			}))
			.sort((a, b) => a.freq! - b.freq!);
	}

	_pruneIneffectiveFilters(
		fr: FreqPoint[],
		frTarget: FreqPoint[],
		filters: EQFilter[]
	): EQFilter[] {
		const baselineError = this._calculateWeightedError(this.applyFilters(fr, filters), frTarget);
		return filters.filter((_filter, index) => {
			const withoutThisFilter = filters.filter((_, i) => i !== index);
			const errorWithout = this._calculateWeightedError(
				this.applyFilters(fr, withoutThisFilter),
				frTarget
			);
			return errorWithout - baselineError > 0.1;
		});
	}
}
