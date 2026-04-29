import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { audioSpectrumStore } from '$lib/stores/audio-spectrum-store.svelte.js';
import { computeBypassMatchLinear } from '$lib/utils/loudness-match.js';

export type AudioSource = '' | 'white' | 'pink' | 'tone' | 'file';

/**
 * AudioPlayerService — module-level singleton owning the entire Web Audio engine
 * and playback state for the EQ audio player.
 *
 * Lives for the page lifetime so audio survives panel switches that unmount the
 * EqAudioPlayer view. Web Audio nodes are kept as plain non-reactive private
 * fields (the `$state` proxy interferes with mutable graph nodes); only the
 * fields the view binds to are wrapped in `$state`.
 */
class AudioPlayerService {
	// --- Non-reactive Web Audio resources ---
	#audioContext: AudioContext | null = null;
	#gainNode: GainNode | null = null;
	#analyserNode: AnalyserNode | null = null;
	#sourceNode: AudioBufferSourceNode | null = null;
	#oscillatorNode: OscillatorNode | null = null;
	// Static gain stage between source and filter chain. Carries the K-weighted
	// bypass-match trim when EQ is toggled off so the bypass path matches the
	// EQ-on path's perceived loudness. Stays at unity when EQ is on.
	#bypassMatchNode: GainNode | null = null;
	#filterNodes: AudioNode[] = [];
	#audioBuffer: AudioBuffer | null = null;

	// --- Non-reactive bookkeeping ---
	#startTime = 0;
	#pausedAt = 0;
	#isSeeking = false;
	#rafId: number | null = null;
	#filterEffectRootInstalled = false;

	// --- Reactive view-bound state ---
	#isPlaying = $state(false);
	#audioSource = $state<AudioSource>('');
	#filtersEnabled = $state(true);
	#volume = $state(0.1);
	#toneFreq = $state(1000);
	#currentTime = $state(0);
	#duration = $state(0);
	#fileLoaded = $state(false);

	// --- Public reactive getters ---
	get isPlaying(): boolean {
		return this.#isPlaying;
	}
	get audioSource(): AudioSource {
		return this.#audioSource;
	}
	get filtersEnabled(): boolean {
		return this.#filtersEnabled;
	}
	get volume(): number {
		return this.#volume;
	}
	get toneFreq(): number {
		return this.#toneFreq;
	}
	get currentTime(): number {
		return this.#currentTime;
	}
	get duration(): number {
		return this.#duration;
	}
	get fileLoaded(): boolean {
		return this.#fileLoaded;
	}

	// --- Setters / commands ---
	setAudioSource(src: AudioSource): void {
		if (this.#isPlaying) this.stop();
		this.#audioSource = src;
	}

	setFiltersEnabled(enabled: boolean): void {
		this.#filtersEnabled = enabled;
	}

	setVolume(v: number): void {
		this.#volume = v;
		if (this.#gainNode) this.#gainNode.gain.value = v;
	}

	setToneFreq(hz: number): void {
		this.#toneFreq = hz;
		if (this.#oscillatorNode && this.#isPlaying) {
			this.#oscillatorNode.frequency.value = hz;
		}
	}

	// --- Internals ---
	#getAudioContext(): AudioContext {
		if (!this.#audioContext) {
			this.#audioContext = new AudioContext();
		}
		return this.#audioContext;
	}

	#ensureBypassMatchNode(ctx: AudioContext): GainNode {
		if (!this.#bypassMatchNode) {
			this.#bypassMatchNode = ctx.createGain();
			this.#bypassMatchNode.gain.value = 1;
		}
		return this.#bypassMatchNode;
	}

	#updateFilters(): void {
		const ctx = this.#audioContext;
		if (!ctx || !this.#gainNode) return;

		const match = this.#ensureBypassMatchNode(ctx);
		// Reset wiring downstream of the source: tear down old filter chain and
		// the bypass-match stage's outputs before rebuilding.
		match.disconnect();
		this.#filterNodes.forEach((n) => n.disconnect());
		this.#filterNodes = [];

		const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
		const chainTail = this.#analyserNode ?? this.#gainNode;

		if (!this.#filtersEnabled || !filters.length) {
			// Bypass path. When EQ is toggled off but filters exist, apply the
			// K-weighted bypass-match trim so listening A/B doesn't change level.
			const trim = filters.length
				? computeBypassMatchLinear(eqStore.filters, eqStore.preamp)
				: 1;
			this.#rampGain(match.gain, trim);
			match.connect(chainTail);
			this.#reconnectSource();
			return;
		}

		// EQ path — match stage is unity, the EQ chain produces the eq-on level.
		this.#rampGain(match.gain, 1);

		// Preamp node
		const preampNode = ctx.createGain();
		preampNode.gain.value = Math.pow(10, eqStore.preamp / 20);
		this.#filterNodes.push(preampNode);

		// Biquad filters
		for (const f of filters) {
			const node = ctx.createBiquadFilter();
			if (f.type === 'PK') node.type = 'peaking';
			else if (f.type === 'LSQ') node.type = 'lowshelf';
			else if (f.type === 'HSQ') node.type = 'highshelf';
			node.frequency.value = f.freq!;
			node.Q.value = f.q!;
			node.gain.value = f.gain!;
			this.#filterNodes.push(node);
		}

		// Chain: match → preamp → filter[0] → ... → analyserNode (or gainNode)
		match.connect(this.#filterNodes[0]);
		for (let i = 0; i < this.#filterNodes.length - 1; i++) {
			this.#filterNodes[i].connect(this.#filterNodes[i + 1]);
		}
		this.#filterNodes[this.#filterNodes.length - 1].connect(chainTail);

		this.#reconnectSource();
	}

	/** Smooth a `GainNode.gain` ramp to avoid clicks on EQ on/off transitions. */
	#rampGain(param: AudioParam, target: number): void {
		const ctx = this.#audioContext;
		if (!ctx) {
			param.value = target;
			return;
		}
		const now = ctx.currentTime;
		param.cancelScheduledValues(now);
		// Hold current value as the ramp anchor, then linear-ramp over 20 ms.
		param.setValueAtTime(param.value, now);
		param.linearRampToValueAtTime(target, now + 0.02);
	}

	#reconnectSource(): void {
		const source: AudioNode | null = this.#sourceNode ?? this.#oscillatorNode ?? null;
		if (!source || !this.#bypassMatchNode) return;
		source.disconnect();
		source.connect(this.#bypassMatchNode);
	}

	#createNoiseNode(type: 'white' | 'pink'): AudioBufferSourceNode {
		const ctx = this.#getAudioContext();
		const bufferSize = 2 * ctx.sampleRate;
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const output = buffer.getChannelData(0);

		if (type === 'white') {
			for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
		} else {
			let b0 = 0,
				b1 = 0,
				b2 = 0,
				b3 = 0,
				b4 = 0,
				b5 = 0,
				b6;
			for (let i = 0; i < bufferSize; i++) {
				const w = Math.random() * 2 - 1;
				b0 = 0.99886 * b0 + w * 0.0555179;
				b1 = 0.99332 * b1 + w * 0.0750759;
				b2 = 0.969 * b2 + w * 0.153852;
				b3 = 0.8665 * b3 + w * 0.3104856;
				b4 = 0.55 * b4 + w * 0.5329522;
				b5 = -0.7616 * b5 - w * 0.016898;
				b6 = w * 0.115926;
				output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
			}
		}

		const node = ctx.createBufferSource();
		node.buffer = buffer;
		node.loop = true;
		return node;
	}

	#tickTimeDisplay = (): void => {
		if (!this.#isPlaying || !this.#audioContext || !this.#audioBuffer) return;
		this.#currentTime = Math.min(
			this.#audioContext.currentTime - this.#startTime + this.#pausedAt,
			this.#audioBuffer.duration
		);
		this.#rafId = requestAnimationFrame(this.#tickTimeDisplay);
	};

	// The `$effect.root` below is intentionally never disposed — this singleton
	// lives for the page lifetime, so its reactive subscription mirrors that.
	#installFilterEffectRoot(): void {
		if (this.#filterEffectRootInstalled) return;
		this.#filterEffectRootInstalled = true;
		$effect.root(() => {
			$effect(() => {
				void eqStore.filters;
				void eqStore.preamp;
				void this.#filtersEnabled;
				this.#updateFilters();
			});
		});
	}

	// --- Playback ---
	play(): void {
		this.#installFilterEffectRoot();

		const ctx = this.#getAudioContext();

		if (!this.#gainNode) {
			this.#gainNode = ctx.createGain();
			this.#gainNode.gain.value = this.#volume;
			this.#gainNode.connect(ctx.destination);
		}

		if (!this.#analyserNode) {
			this.#analyserNode = ctx.createAnalyser();
			this.#analyserNode.fftSize = 4096;
			this.#analyserNode.smoothingTimeConstant = 0.8;
			this.#analyserNode.connect(this.#gainNode);
			audioSpectrumStore.analyserNode = this.#analyserNode;
		}

		this.#updateFilters();

		// All sources route into bypassMatchNode; #updateFilters() wires the
		// rest of the chain (filters or bypass) downstream.
		const sourceTarget = this.#ensureBypassMatchNode(ctx);

		if (this.#audioSource === 'white' || this.#audioSource === 'pink') {
			this.#sourceNode = this.#createNoiseNode(this.#audioSource);
			this.#sourceNode.connect(sourceTarget);
			this.#sourceNode.start();
		} else if (this.#audioSource === 'tone') {
			this.#oscillatorNode = ctx.createOscillator();
			this.#oscillatorNode.type = 'sine';
			this.#oscillatorNode.frequency.value = this.#toneFreq;
			this.#oscillatorNode.connect(sourceTarget);
			this.#oscillatorNode.start();
		} else if (this.#audioSource === 'file' && this.#audioBuffer) {
			this.#sourceNode = ctx.createBufferSource();
			this.#sourceNode.buffer = this.#audioBuffer;
			this.#sourceNode.connect(sourceTarget);
			this.#sourceNode.start(0, this.#pausedAt);
			this.#sourceNode.onended = () => {
				if (this.#isPlaying && !this.#isSeeking) {
					this.#isPlaying = false;
					this.#pausedAt = 0;
					this.#currentTime = 0;
					if (this.#rafId) {
						cancelAnimationFrame(this.#rafId);
						this.#rafId = null;
					}
				}
			};
		} else return;

		this.#startTime = ctx.currentTime;
		this.#isPlaying = true;

		if (this.#audioSource === 'file') this.#tickTimeDisplay();
	}

	pause(): void {
		if (!this.#isPlaying) return;
		this.#sourceNode?.stop();
		this.#sourceNode?.disconnect();
		this.#sourceNode = null;
		this.#oscillatorNode?.stop();
		this.#oscillatorNode?.disconnect();
		this.#oscillatorNode = null;
		// Only file playback resumes via #pausedAt; accumulating it for noise/tone
		// would pollute the next file resume position.
		if (this.#audioSource === 'file' && this.#audioContext) {
			this.#pausedAt += this.#audioContext.currentTime - this.#startTime;
		}
		this.#isPlaying = false;
		if (this.#rafId) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}

	stop(): void {
		this.pause();
		this.#pausedAt = 0;
		this.#currentTime = 0;
	}

	togglePlay(): void {
		if (!this.#audioSource) return;
		if (this.#isPlaying) this.pause();
		else this.play();
	}

	seekTo(targetTime: number): void {
		if (!this.#audioBuffer) return;
		const wasPlaying = this.#isPlaying;
		if (wasPlaying && this.#sourceNode) {
			this.#sourceNode.onended = null;
			this.#sourceNode.stop();
			this.#sourceNode.disconnect();
			this.#sourceNode = null;
		}
		this.#pausedAt = targetTime;
		this.#currentTime = targetTime;
		if (wasPlaying) {
			const ctx = this.#getAudioContext();
			this.#sourceNode = ctx.createBufferSource();
			this.#sourceNode.buffer = this.#audioBuffer;
			this.#sourceNode.connect(this.#ensureBypassMatchNode(ctx));
			this.#sourceNode.start(0, this.#pausedAt);
			this.#sourceNode.onended = () => {
				if (this.#isPlaying && !this.#isSeeking) {
					this.#isPlaying = false;
					this.#pausedAt = 0;
					this.#currentTime = 0;
					if (this.#rafId) {
						cancelAnimationFrame(this.#rafId);
						this.#rafId = null;
					}
				}
			};
			this.#startTime = ctx.currentTime;
		}
	}

	async loadFile(file: File): Promise<void> {
		const ctx = this.#getAudioContext();
		const arrayBuf = await file.arrayBuffer();
		this.#audioBuffer = await ctx.decodeAudioData(arrayBuf);
		this.#duration = this.#audioBuffer.duration;
		this.#pausedAt = 0;
		this.#currentTime = 0;
		this.#fileLoaded = true;
	}
}

export const audioPlayerService = new AudioPlayerService();
