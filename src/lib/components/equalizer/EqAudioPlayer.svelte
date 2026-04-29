<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { audioSpectrumStore } from '$lib/stores/audio-spectrum-store.svelte.js';
	import { computeBypassMatchLinear } from '$lib/utils/loudness-match.js';
	import * as m from '$lib/paraglide/messages.js';
	import { onDestroy } from 'svelte';
	import Button from '$lib/components/atoms/Button.svelte';
	import { FileUp, Pause, Play, Square, VolumeX, Volume2 } from '@lucide/svelte';
	import Switch from '../atoms/Switch.svelte';

	// --- Non-reactive Web Audio objects ---
	let audioContext: AudioContext | null = null;
	let gainNode: GainNode | null = null;
	let analyserNode: AnalyserNode | null = null;
	// Static gain stage between source and filter chain. Carries the
	// K-weighted bypass-match trim when EQ is toggled off so the bypass path
	// matches the EQ-on path's perceived loudness. Stays at unity when EQ is on.
	let bypassMatchNode: GainNode | null = null;
	let sourceNode: AudioBufferSourceNode | null = null;
	let oscillatorNode: OscillatorNode | null = null;
	let filterNodes: AudioNode[] = [];
	let audioBuffer: AudioBuffer | null = null;

	// --- Playback tracking ---
	let isPlaying = $state(false);
	let startTime = 0;
	let pausedAt = 0;
	let isSeeking = false;

	// --- UI state ---
	let audioSource = $state('');
	let filtersEnabled = $state(true);
	let showSpectrum = $state(false);
	let volume = $state(0.1);
	let toneFreq = $state(1000);
	let currentTime = $state(0);
	let duration = $state(0);
	let fileLoaded = $state(false);

	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);
	let rafId: number | null = null;

	// --- Helpers ---
	function formatTime(seconds: number): string {
		const min = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${min}:${String(s).padStart(2, '0')}`;
	}

	function getAudioContext(): AudioContext {
		if (!audioContext) {
			audioContext = new AudioContext();
		}
		return audioContext;
	}

	// --- Filter chain ---
	function ensureBypassMatchNode(ctx: AudioContext): GainNode {
		if (!bypassMatchNode) {
			bypassMatchNode = ctx.createGain();
			bypassMatchNode.gain.value = 1;
		}
		return bypassMatchNode;
	}

	function updateFilters() {
		const ctx = audioContext;
		if (!ctx || !gainNode) return;

		const match = ensureBypassMatchNode(ctx);
		// Reset wiring downstream of the source: tear down old filter chain
		// and the bypass-match stage's outputs before rebuilding.
		match.disconnect();
		filterNodes.forEach((n) => n.disconnect());
		filterNodes = [];

		const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
		const chainTail = analyserNode ?? gainNode;

		if (!filtersEnabled || !filters.length) {
			// Bypass path. When EQ is toggled off but filters exist, apply the
			// K-weighted bypass-match trim so listening A/B doesn't change level.
			const trim = filters.length ? computeBypassMatchLinear(eqStore.filters, eqStore.preamp) : 1;
			rampGain(match.gain, trim);
			match.connect(chainTail);
			reconnectSource();
			return;
		}

		// EQ path — match stage is unity, the EQ chain produces the eq-on level.
		rampGain(match.gain, 1);

		// Preamp node
		const preampNode = ctx.createGain();
		preampNode.gain.value = Math.pow(10, eqStore.preamp / 20);
		filterNodes.push(preampNode);

		// Biquad filters
		for (const f of filters) {
			const node = ctx.createBiquadFilter();
			if (f.type === 'PK') node.type = 'peaking';
			else if (f.type === 'LSQ') node.type = 'lowshelf';
			else if (f.type === 'HSQ') node.type = 'highshelf';
			node.frequency.value = f.freq!;
			node.Q.value = f.q!;
			node.gain.value = f.gain!;
			filterNodes.push(node);
		}

		// Chain: match → preamp → filter[0] → ... → chainTail
		match.connect(filterNodes[0]);
		for (let i = 0; i < filterNodes.length - 1; i++) {
			filterNodes[i].connect(filterNodes[i + 1]);
		}
		filterNodes[filterNodes.length - 1].connect(chainTail);

		reconnectSource();
	}

	/** Smooth a `GainNode.gain` ramp to avoid clicks on EQ on/off transitions. */
	function rampGain(param: AudioParam, target: number) {
		const ctx = audioContext;
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

	function reconnectSource() {
		const source: AudioNode | null = sourceNode ?? oscillatorNode ?? null;
		if (!source || !bypassMatchNode) return;
		source.disconnect();
		source.connect(bypassMatchNode);
	}

	$effect(() => {
		const _filters = eqStore.filters;
		const _preamp = eqStore.preamp;
		const _enabled = filtersEnabled;
		updateFilters();
	});

	// --- Noise generators ---
	function createNoiseNode(type: 'white' | 'pink'): AudioBufferSourceNode {
		const ctx = getAudioContext();
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
				b6 = 0;
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

	// --- Playback ---
	function play() {
		const ctx = getAudioContext();

		if (!gainNode) {
			gainNode = ctx.createGain();
			gainNode.gain.value = volume;
			gainNode.connect(ctx.destination);
		}

		if (!analyserNode) {
			analyserNode = ctx.createAnalyser();
			analyserNode.fftSize = 4096;
			analyserNode.smoothingTimeConstant = 0.8;
			analyserNode.connect(gainNode);
			audioSpectrumStore.analyserNode = analyserNode;
		}

		ensureBypassMatchNode(ctx);
		updateFilters();

		// All sources route into bypassMatchNode; updateFilters() wires the
		// rest of the chain (filters or bypass) downstream.
		const sourceTarget = bypassMatchNode!;

		if (audioSource === 'white' || audioSource === 'pink') {
			sourceNode = createNoiseNode(audioSource);
			sourceNode.connect(sourceTarget);
			sourceNode.start();
		} else if (audioSource === 'tone') {
			oscillatorNode = ctx.createOscillator();
			oscillatorNode.type = 'sine';
			oscillatorNode.frequency.value = toneFreq;
			oscillatorNode.connect(sourceTarget);
			oscillatorNode.start();
		} else if (audioSource === 'file' && audioBuffer) {
			sourceNode = ctx.createBufferSource();
			sourceNode.buffer = audioBuffer;
			sourceNode.connect(sourceTarget);
			sourceNode.start(0, pausedAt);
			sourceNode.onended = () => {
				if (isPlaying && !isSeeking) {
					isPlaying = false;
					pausedAt = 0;
					currentTime = 0;
					if (rafId) {
						cancelAnimationFrame(rafId);
						rafId = null;
					}
				}
			};
		} else return;

		startTime = ctx.currentTime;
		isPlaying = true;

		if (audioSource === 'file') tickTimeDisplay();
	}

	function pause() {
		if (!isPlaying) return;
		sourceNode?.stop();
		sourceNode?.disconnect();
		sourceNode = null;
		oscillatorNode?.stop();
		oscillatorNode?.disconnect();
		oscillatorNode = null;
		if (audioContext) pausedAt += audioContext.currentTime - startTime;
		isPlaying = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function stop() {
		pause();
		pausedAt = 0;
		currentTime = 0;
	}

	function togglePlay() {
		if (!audioSource) return;
		if (isPlaying) pause();
		else play();
	}

	function tickTimeDisplay() {
		if (!isPlaying || !audioContext || !audioBuffer) return;
		currentTime = Math.min(audioContext.currentTime - startTime + pausedAt, audioBuffer.duration);
		rafId = requestAnimationFrame(tickTimeDisplay);
	}

	// --- Seeking ---
	function seekTo(targetTime: number) {
		if (!audioBuffer) return;
		const wasPlaying = isPlaying;
		if (wasPlaying && sourceNode) {
			sourceNode.onended = null;
			sourceNode.stop();
			sourceNode.disconnect();
			sourceNode = null;
		}
		pausedAt = targetTime;
		currentTime = targetTime;
		if (wasPlaying) {
			const ctx = getAudioContext();
			sourceNode = ctx.createBufferSource();
			sourceNode.buffer = audioBuffer;
			sourceNode.connect(ensureBypassMatchNode(ctx));
			sourceNode.start(0, pausedAt);
			sourceNode.onended = () => {
				if (isPlaying && !isSeeking) {
					isPlaying = false;
					pausedAt = 0;
					currentTime = 0;
					if (rafId) {
						cancelAnimationFrame(rafId);
						rafId = null;
					}
				}
			};
			startTime = ctx.currentTime;
		}
	}

	// --- File loading ---
	async function loadFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const ctx = getAudioContext();
		const arrayBuf = await file.arrayBuffer();
		audioBuffer = await ctx.decodeAudioData(arrayBuf);
		duration = audioBuffer.duration;
		pausedAt = 0;
		currentTime = 0;
		fileLoaded = true;
	}

	// --- Cleanup ---
	onDestroy(() => {
		if (rafId) cancelAnimationFrame(rafId);
		stop();
		bypassMatchNode?.disconnect();
		bypassMatchNode = null;
		audioSpectrumStore.analyserNode = null;
		audioSpectrumStore.isEnabled = false;
		audioContext?.close();
		audioContext = null;
	});
</script>

<div class="flex flex-col gap-3">
	<!-- EQ toggle -->
	<div class="flex items-center gap-4">
		<Switch
			title={filtersEnabled ? 'Disable EQ filters' : 'Enable EQ filters'}
			labelText={m.equalizer_player_filter_toggle()}
			labelClass="text-xs"
			size="sm"
			checked={filtersEnabled}
			onCheckedChange={(checked) => {
				filtersEnabled = checked;
			}}
		/>
		<Switch
			title={showSpectrum ? 'Hide audio spectrum' : 'Show audio spectrum'}
			labelText={m.equalizer_player_spectrum_toggle()}
			labelClass="text-xs"
			size="sm"
			checked={showSpectrum}
			onCheckedChange={() => {
				showSpectrum = !showSpectrum;
				audioSpectrumStore.isEnabled = showSpectrum;
			}}
		/>
	</div>

	<!-- Source select -->
	<select
		value={audioSource}
		onchange={(e) => {
			audioSource = (e.target as HTMLSelectElement).value;
			if (isPlaying) stop();
		}}
		class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
	>
		<option value="">{m.equalizer_player_option_init()}</option>
		<option value="white">{m.equalizer_player_option_white()}</option>
		<option value="pink">{m.equalizer_player_option_pink()}</option>
		<option value="tone">{m.equalizer_player_option_tone()}</option>
		<option value="file">{m.equalizer_player_option_file()}</option>
	</select>

	<!-- Tone controls (only when tone selected) -->
	{#if audioSource === 'tone'}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-base-content/60"
				>{m.equalizer_player_tone_freq_label()}<span class="font-medium">{toneFreq} Hz</span></span
			>
			<input
				type="range"
				min="0"
				max="1000"
				step="1"
				value={Math.round(
					((Math.log10(toneFreq) - Math.log10(20)) / (Math.log10(20000) - Math.log10(20))) * 1000
				)}
				oninput={(e) => {
					const v = parseFloat((e.target as HTMLInputElement).value);
					toneFreq = Math.round(
						Math.pow(10, Math.log10(20) + (v / 1000) * (Math.log10(20000) - Math.log10(20)))
					);
					if (oscillatorNode && isPlaying) oscillatorNode.frequency.value = toneFreq;
				}}
				class="w-full accent-accent"
			/>
		</div>
	{/if}

	<!-- File upload (only when file selected) -->
	{#if audioSource === 'file'}
		<Button
			title={m.equalizer_player_file_upload()}
			onclick={() => fileInputEl?.click()}
			variant="outline"
			size="sm"
			class="w-full"
		>
			<FileUp class="mr-1.5 size-3.5" />
			{m.equalizer_player_file_upload()}
		</Button>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="audio/*"
			class="hidden"
			onchange={loadFile}
		/>
		{#if fileLoaded}
			<div class="flex items-center gap-2 text-xs text-base-content/60">
				<span class="tabular-nums">{formatTime(currentTime)}</span>
				<input
					type="range"
					min="0"
					max={duration}
					step="0.1"
					value={currentTime}
					oninput={(e) => seekTo(parseFloat((e.target as HTMLInputElement).value))}
					class="flex-1 accent-accent"
				/>
				<span class="tabular-nums">{formatTime(duration)}</span>
			</div>
		{/if}
	{/if}

	<!-- Playback controls -->
	<div class="flex items-center gap-1.5">
		<Button title="Stop Audio" onclick={stop} disabled={!audioSource} variant="muted" size="icon">
			<Square class="size-3.5" />
		</Button>
		<Button
			title={isPlaying ? 'Pause Audio' : 'Play Audio'}
			onclick={togglePlay}
			disabled={!audioSource || (audioSource === 'file' && !fileLoaded)}
			variant="muted"
			size="icon"
		>
			{#if isPlaying}
				<Pause class="size-3.5" />
			{:else}
				<Play class="size-3.5" />
			{/if}
		</Button>
		<div class="mx-1 h-5 w-px bg-base-content/30"></div>
		<!-- Volume slider -->
		<div class="flex flex-1 items-center gap-1">
			{#if volume == 0}
				<VolumeX class="size-3.5 text-base-content/60" />
			{:else}
				<Volume2 class="size-3.5" />
			{/if}
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={volume}
				oninput={(e) => {
					volume = parseFloat((e.target as HTMLInputElement).value);
					if (gainNode) gainNode.gain.value = volume;
				}}
				class="w-full accent-accent"
			/>
		</div>
	</div>
</div>
