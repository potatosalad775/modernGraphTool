import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { flushSync } from 'svelte';
import { audioPlayerService } from './audio-player-service.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { audioRangeStore } from '$lib/stores/audio-range-store.svelte.js';
import { computeBypassMatchLinear } from '$lib/utils/loudness-match.js';
import { rangeMakeupGain, RANGE_FILTER_Q } from '$lib/utils/listening-range.js';

/**
 * The service is exercised against a recording fake AudioContext rather than the
 * browser's real one: the invariants worth protecting are about the *shape of
 * the node graph* (is the bandpass there, is the trim applied, what is the chain
 * order), and those are observable only if every `connect()` is recorded.
 */

// ── Fake Web Audio ───────────────────────────────────────────────────────────

class FakeParam {
	value: number;
	constructor(value = 0) {
		this.value = value;
	}
	cancelScheduledValues(): void {}
	setValueAtTime(v: number): void {
		this.value = v;
	}
	// The service ramps rather than assigning, so the ramp target is the value a
	// test needs to see.
	linearRampToValueAtTime(v: number): void {
		this.value = v;
	}
	exponentialRampToValueAtTime(v: number): void {
		this.value = v;
	}
}

class FakeNode {
	readonly outputs = new Set<FakeNode>();
	type = '';
	frequency = new FakeParam(0);
	Q = new FakeParam(0);
	gain = new FakeParam(1);
	buffer: unknown = null;
	loop = false;
	fftSize = 0;
	smoothingTimeConstant = 0;
	onended: (() => void) | null = null;
	started = false;
	stopped = false;

	constructor(readonly kind: string) {}

	connect(node: FakeNode): FakeNode {
		this.outputs.add(node);
		return node;
	}
	disconnect(): void {
		this.outputs.clear();
	}
	start(): void {
		this.started = true;
	}
	stop(): void {
		this.stopped = true;
	}
}

class FakeAudioContext {
	// Low rate keeps the 2-second noise buffer the service fills cheap to build.
	readonly sampleRate = 8000;
	currentTime = 0;
	readonly destination = new FakeNode('destination');
	readonly nodes: FakeNode[] = [];

	#make(kind: string): FakeNode {
		const node = new FakeNode(kind);
		this.nodes.push(node);
		return node;
	}
	createGain() {
		return this.#make('gain');
	}
	createBiquadFilter() {
		return this.#make('biquad');
	}
	createAnalyser() {
		return this.#make('analyser');
	}
	createOscillator() {
		return this.#make('oscillator');
	}
	createBufferSource() {
		return this.#make('buffersource');
	}
	createBuffer(channels: number, length: number, sampleRate: number) {
		return {
			duration: length / sampleRate,
			getChannelData: () => new Float32Array(length)
		};
	}
}

let ctx: FakeAudioContext;
let originalAudioContext: unknown;
// The service caches these three for the page lifetime, so they are captured
// once against a clean recording rather than searched for each test — creation
// order (master gain, analyser, bypass-match) makes positional lookup fragile.
let matchNode: FakeNode;
let masterGainNode: FakeNode;

// ── Graph inspection ─────────────────────────────────────────────────────────

function bypassMatchNode(): FakeNode {
	return matchNode;
}

/** Follow single-output edges from `start`, returning the node kinds in order. */
function chainFrom(start: FakeNode): FakeNode[] {
	const chain: FakeNode[] = [];
	let node: FakeNode | undefined = start;
	const seen = new Set<FakeNode>();
	while (node && !seen.has(node)) {
		seen.add(node);
		chain.push(node);
		node = [...node.outputs][0];
	}
	return chain;
}

function downstreamOfMatch(): FakeNode[] {
	return chainFrom(bypassMatchNode()).slice(1);
}

function kinds(nodes: FakeNode[]): string[] {
	return nodes.map((n) => n.kind);
}

function biquadsOfType(type: string): FakeNode[] {
	return downstreamOfMatch().filter((n) => n.kind === 'biquad' && n.type === type);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FILTERS = [
	{ enabled: true, type: 'PK', freq: 1000, q: 1.4, gain: 6 },
	{ enabled: true, type: 'LSQ', freq: 100, q: 0.7, gain: -4 },
	{ enabled: true, type: 'HSQ', freq: 8000, q: 0.7, gain: 3 }
];

function setFilters(filters: typeof FILTERS, preamp = 0) {
	eqStore.filters = structuredClone(filters) as typeof eqStore.filters;
	eqStore.preamp = preamp;
}

/** Effects live in a `$effect.root`, so a write needs an explicit flush. */
function settle() {
	flushSync();
}

describe('AudioPlayerService', () => {
	beforeAll(() => {
		originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;
		ctx = new FakeAudioContext();
		(globalThis as Record<string, unknown>).AudioContext = function () {
			return ctx;
		};

		// One priming run to capture the long-lived nodes. White noise routes
		// straight into the bypass-match stage, so the source's only output is it.
		eqStore.isEnabled = true;
		setFilters(FILTERS);
		audioPlayerService.setAudioSource('white');
		audioPlayerService.play();
		flushSync();

		const source = ctx.nodes.find((n) => n.kind === 'buffersource')!;
		matchNode = [...source.outputs][0];
		masterGainNode = ctx.nodes.find((n) => [...n.outputs].includes(ctx.destination))!;
		audioPlayerService.stop();
	});

	afterAll(() => {
		(globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
		audioPlayerService.stop();
	});

	beforeEach(() => {
		// The service caches its AudioContext for the page lifetime, so every test
		// shares one — reset the recording, not the singleton.
		audioPlayerService.stop();
		ctx.nodes.length = 0;

		eqStore.isEnabled = true;
		setFilters(FILTERS);
		audioPlayerService.setFiltersEnabled(true);
		audioRangeStore.isFrequencySelectionMode = false;
		audioRangeStore.reset();
		audioPlayerService.setAudioSource('white');
		settle();
	});

	// ── EQ bypass predicate ──────────────────────────────────────────────────

	describe('EQ bypass reaches the audio graph', () => {
		it('builds the filter chain when EQ is on', () => {
			audioPlayerService.play();
			settle();

			const chain = downstreamOfMatch();
			// preamp gain, then one biquad per filter.
			expect(chain.filter((n) => n.kind === 'biquad')).toHaveLength(FILTERS.length);
			expect(bypassMatchNode().gain.value).toBe(1);
		});

		it('maps each filter type to the right biquad type, frequency, Q and gain', () => {
			audioPlayerService.play();
			settle();

			const biquads = downstreamOfMatch().filter((n) => n.kind === 'biquad');
			expect(kinds(biquads)).toHaveLength(3);
			expect(biquads.map((n) => n.type)).toEqual(['peaking', 'lowshelf', 'highshelf']);
			expect(biquads.map((n) => n.frequency.value)).toEqual([1000, 100, 8000]);
			expect(biquads.map((n) => n.Q.value)).toEqual([1.4, 0.7, 0.7]);
			expect(biquads.map((n) => n.gain.value)).toEqual([6, -4, 3]);
		});

		it('applies the bypass-match trim when the master toggle turns EQ off', () => {
			// This is the `\` momentary-bypass key and the master "Equalizer" switch,
			// both of which write eqStore.isEnabled.
			audioPlayerService.play();
			settle();
			eqStore.isEnabled = false;
			settle();

			const expected = computeBypassMatchLinear(eqStore.filters, eqStore.preamp);
			expect(bypassMatchNode().gain.value).toBeCloseTo(expected, 6);
			expect(expected).not.toBe(1);
			expect(downstreamOfMatch().some((n) => n.kind === 'biquad')).toBe(false);
		});

		it("applies the same trim when the player's own EQ Effect switch turns EQ off", () => {
			audioPlayerService.play();
			settle();
			audioPlayerService.setFiltersEnabled(false);
			settle();

			const expected = computeBypassMatchLinear(eqStore.filters, eqStore.preamp);
			expect(bypassMatchNode().gain.value).toBeCloseTo(expected, 6);
			expect(downstreamOfMatch().some((n) => n.kind === 'biquad')).toBe(false);
		});

		it('restores unity gain and the filter chain when EQ comes back on', () => {
			audioPlayerService.play();
			settle();
			eqStore.isEnabled = false;
			settle();
			eqStore.isEnabled = true;
			settle();

			expect(bypassMatchNode().gain.value).toBe(1);
			expect(downstreamOfMatch().filter((n) => n.kind === 'biquad')).toHaveLength(3);
		});

		it('leaves the trim at unity when there is nothing to bypass', () => {
			setFilters([], 0);
			settle();
			audioPlayerService.play();
			settle();
			eqStore.isEnabled = false;
			settle();

			expect(bypassMatchNode().gain.value).toBe(1);
		});

		it('treats a preamp with no filters as something to apply', () => {
			// The preamp must survive on its own, and the bypass path has to match
			// its level.
			setFilters([], -6);
			settle();
			audioPlayerService.play();
			settle();

			const preampNode = downstreamOfMatch()[0];
			expect(preampNode.kind).toBe('gain');
			expect(preampNode.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 6);

			eqStore.isEnabled = false;
			settle();
			expect(bypassMatchNode().gain.value).not.toBe(1);
		});

		it('ignores disabled and half-filled filter bands', () => {
			// `null` is the "not filled in yet" state for a new band; gain 0 is a real
			// filter and must not be dropped, or the preamp goes with it.
			eqStore.filters = [
				{ enabled: false, type: 'PK', freq: 500, q: 1, gain: 5 },
				{ enabled: true, type: 'PK', freq: null, q: 1, gain: 5 },
				{ enabled: true, type: 'PK', freq: 2000, q: 1, gain: 0 }
			] as unknown as typeof eqStore.filters;
			settle();
			audioPlayerService.play();
			settle();

			const biquads = downstreamOfMatch().filter((n) => n.kind === 'biquad');
			expect(biquads).toHaveLength(1);
			expect(biquads[0].frequency.value).toBe(2000);
		});
	});

	// ── Listening-range gating ───────────────────────────────────────────────

	describe('listening-range gating applies to broadband sources only', () => {
		beforeEach(() => {
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(200, 4000);
			settle();
		});

		it.each(['white', 'pink', 'file'] as const)('inserts the bandpass for %s', (source) => {
			audioPlayerService.setAudioSource(source);
			settle();
			audioPlayerService.play();
			settle();

			expect(biquadsOfType('highpass')).toHaveLength(1);
			expect(biquadsOfType('lowpass')).toHaveLength(1);
		});

		it.each(['tone', 'sweep'] as const)('does not insert the bandpass for %s', (source) => {
			// A tone has energy at one frequency; a bandpass could only attenuate it.
			audioPlayerService.setAudioSource(source);
			settle();
			audioPlayerService.play();
			settle();

			expect(biquadsOfType('highpass')).toHaveLength(0);
			expect(biquadsOfType('lowpass')).toHaveLength(0);
		});

		it('tunes the pair to the band with Butterworth Q and adds makeup gain', () => {
			audioPlayerService.play();
			settle();

			expect(biquadsOfType('highpass')[0].frequency.value).toBe(200);
			expect(biquadsOfType('highpass')[0].Q.value).toBe(RANGE_FILTER_Q);
			expect(biquadsOfType('lowpass')[0].frequency.value).toBe(4000);

			const makeup = downstreamOfMatch().find(
				(n) => n.kind === 'gain' && n.gain.value === rangeMakeupGain(200, 4000)
			);
			expect(makeup).toBeDefined();
		});

		it('retunes the existing bandpass in place on a range drag', () => {
			audioPlayerService.play();
			settle();
			const hp = biquadsOfType('highpass')[0];
			const lp = biquadsOfType('lowpass')[0];

			audioRangeStore.setRange(500, 2000);
			settle();

			// Same node objects — a pointer-rate drag must not rebuild the chain.
			expect(biquadsOfType('highpass')[0]).toBe(hp);
			expect(hp.frequency.value).toBe(500);
			expect(lp.frequency.value).toBe(2000);
		});

		it('keeps the bandpass downstream even when EQ is bypassed', () => {
			audioPlayerService.play();
			settle();
			eqStore.isEnabled = false;
			settle();

			expect(biquadsOfType('highpass')).toHaveLength(1);
			expect(downstreamOfMatch().some((n) => n.kind === 'biquad' && n.type === 'peaking')).toBe(
				false
			);
		});

		it('removes the bandpass when frequency-selection mode is turned off', () => {
			audioPlayerService.play();
			settle();
			expect(biquadsOfType('highpass')).toHaveLength(1);

			audioRangeStore.isFrequencySelectionMode = false;
			settle();
			expect(biquadsOfType('highpass')).toHaveLength(0);
		});
	});

	// ── Clamping for single-frequency sources ────────────────────────────────

	describe('tone and sweep are clamped to the band instead of filtered', () => {
		it('clamps a tone set outside the band', () => {
			audioPlayerService.setAudioSource('tone');
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(200, 1000);
			settle();

			audioPlayerService.setToneFreq(5000);
			expect(audioPlayerService.toneFreq).toBe(1000);

			audioPlayerService.setToneFreq(50);
			expect(audioPlayerService.toneFreq).toBe(200);
		});

		it('pulls a tone back inside when the band itself moves', () => {
			audioPlayerService.setAudioSource('tone');
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(100, 10000);
			settle();
			audioPlayerService.setToneFreq(8000);
			expect(audioPlayerService.toneFreq).toBe(8000);

			audioRangeStore.setRange(100, 2000);
			settle();
			expect(audioPlayerService.toneFreq).toBe(2000);
		});

		it('clamps both sweep endpoints', () => {
			audioPlayerService.setAudioSource('sweep');
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(300, 3000);
			settle();

			audioPlayerService.setSweepFromHz(20);
			audioPlayerService.setSweepToHz(20000);
			expect(audioPlayerService.sweepFromHz).toBe(300);
			expect(audioPlayerService.sweepToHz).toBe(3000);
		});

		it('keeps clamped values when the band is released — clamps are sticky', () => {
			audioPlayerService.setAudioSource('tone');
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(200, 1000);
			settle();
			audioPlayerService.setToneFreq(5000);
			expect(audioPlayerService.toneFreq).toBe(1000);

			audioRangeStore.isFrequencySelectionMode = false;
			settle();

			// Leaving range mode does not restore the pre-clamp 5000 Hz.
			expect(audioPlayerService.toneFreq).toBe(1000);
		});

		it('does not clamp when frequency-selection mode is off', () => {
			audioPlayerService.setAudioSource('tone');
			audioRangeStore.setRange(200, 1000);
			settle();

			audioPlayerService.setToneFreq(12000);
			expect(audioPlayerService.toneFreq).toBe(12000);
		});

		it('bounds sweep endpoints to the audible band even with no range selected', () => {
			audioPlayerService.setAudioSource('sweep');
			settle();
			audioPlayerService.setSweepFromHz(1);
			audioPlayerService.setSweepToHz(99999);

			expect(audioPlayerService.sweepFromHz).toBe(20);
			expect(audioPlayerService.sweepToHz).toBe(20000);
		});

		it('leaves a tone alone while the source is a sweep and vice versa', () => {
			// #clampToneToRange bails unless the active source is a tone.
			audioPlayerService.setAudioSource('sweep');
			audioRangeStore.isFrequencySelectionMode = true;
			settle();
			audioPlayerService.setAudioSource('tone');
			audioPlayerService.setToneFreq(15000);
			settle();

			audioRangeStore.setRange(100, 500);
			settle();
			expect(audioPlayerService.toneFreq).toBe(500);
		});
	});

	// ── Playback state ───────────────────────────────────────────────────────

	describe('playback state', () => {
		it('stops playback before switching source', () => {
			audioPlayerService.play();
			settle();
			expect(audioPlayerService.isPlaying).toBe(true);

			audioPlayerService.setAudioSource('pink');
			expect(audioPlayerService.isPlaying).toBe(false);
			expect(audioPlayerService.audioSource).toBe('pink');
		});

		it('starts an oscillator for tone and a buffer source for noise', () => {
			audioPlayerService.play();
			settle();
			expect(ctx.nodes.some((n) => n.kind === 'buffersource' && n.started)).toBe(true);

			audioPlayerService.setAudioSource('tone');
			settle();
			audioPlayerService.play();
			settle();
			const osc = ctx.nodes.find((n) => n.kind === 'oscillator');
			expect(osc?.started).toBe(true);
			expect(osc?.type).toBe('sine');
			expect(osc?.frequency.value).toBe(audioPlayerService.toneFreq);
		});

		it('routes a sweep through a fade stage so the loop wraparound does not pop', () => {
			audioPlayerService.setAudioSource('sweep');
			settle();
			audioPlayerService.play();
			settle();

			const osc = ctx.nodes.find((n) => n.kind === 'oscillator')!;
			const fade = [...osc.outputs][0];
			expect(fade.kind).toBe('gain');
			expect(fade).not.toBe(bypassMatchNode());
			expect([...fade.outputs][0]).toBe(bypassMatchNode());
		});

		it('does nothing on play when no source is selected', () => {
			audioPlayerService.setAudioSource('');
			settle();
			audioPlayerService.play();
			expect(audioPlayerService.isPlaying).toBe(false);
		});

		it('togglePlay is a no-op without a source', () => {
			audioPlayerService.setAudioSource('');
			settle();
			audioPlayerService.togglePlay();
			expect(audioPlayerService.isPlaying).toBe(false);
		});

		it('togglePlay starts then pauses', () => {
			audioPlayerService.togglePlay();
			settle();
			expect(audioPlayerService.isPlaying).toBe(true);
			audioPlayerService.togglePlay();
			expect(audioPlayerService.isPlaying).toBe(false);
		});

		it('pause is a no-op when already stopped', () => {
			audioPlayerService.pause();
			expect(audioPlayerService.isPlaying).toBe(false);
		});

		it('terminates the chain at the analyser, then the master gain, then the destination', () => {
			audioPlayerService.play();
			settle();

			const chain = kinds(downstreamOfMatch());
			expect(chain.slice(-3)).toEqual(['analyser', 'gain', 'destination']);
		});
	});

	// ── Simple setters ───────────────────────────────────────────────────────

	describe('setters', () => {
		it('setVolume writes through to the master gain node', () => {
			audioPlayerService.play();
			settle();
			audioPlayerService.setVolume(0.42);

			expect(audioPlayerService.volume).toBe(0.42);
			expect(masterGainNode.gain.value).toBe(0.42);
		});

		it('setSweepDurationSec clamps to the 0.5–60 s range', () => {
			audioPlayerService.setSweepDurationSec(0.1);
			expect(audioPlayerService.sweepDurationSec).toBe(0.5);
			audioPlayerService.setSweepDurationSec(600);
			expect(audioPlayerService.sweepDurationSec).toBe(60);
			audioPlayerService.setSweepDurationSec(12);
			expect(audioPlayerService.sweepDurationSec).toBe(12);
		});

		it('setSweepLoop toggles the loop flag', () => {
			audioPlayerService.setSweepLoop(false);
			expect(audioPlayerService.sweepLoop).toBe(false);
			audioPlayerService.setSweepLoop(true);
			expect(audioPlayerService.sweepLoop).toBe(true);
		});
	});
});
