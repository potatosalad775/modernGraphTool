<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import * as m from '$lib/paraglide/messages.js';
	import { onDestroy } from 'svelte';

	// --- Non-reactive Web Audio objects ---
	let audioContext: AudioContext | null = null;
	let gainNode: GainNode | null = null;
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
	function updateFilters() {
		const ctx = audioContext;
		if (!ctx || !gainNode) return;

		filterNodes.forEach((n) => n.disconnect());
		filterNodes = [];

		const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);

		if (!filtersEnabled || !filters.length) {
			reconnectSource();
			return;
		}

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
			node.frequency.value = f.freq;
			node.Q.value = f.q;
			node.gain.value = f.gain;
			filterNodes.push(node);
		}

		// Chain: filter[0] → filter[1] → ... → gainNode
		for (let i = 0; i < filterNodes.length - 1; i++) {
			filterNodes[i].connect(filterNodes[i + 1]);
		}
		filterNodes[filterNodes.length - 1].connect(gainNode);

		reconnectSource();
	}

	function reconnectSource() {
		const source: AudioNode | null = sourceNode ?? oscillatorNode ?? null;
		if (!source) return;
		source.disconnect();
		if (filterNodes.length > 0) {
			source.connect(filterNodes[0]);
		} else {
			source.connect(gainNode!);
		}
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

		updateFilters();

		if (audioSource === 'white' || audioSource === 'pink') {
			sourceNode = createNoiseNode(audioSource);
			const target = filterNodes.length > 0 ? filterNodes[0] : gainNode;
			sourceNode.connect(target);
			sourceNode.start();
		} else if (audioSource === 'tone') {
			oscillatorNode = ctx.createOscillator();
			oscillatorNode.type = 'sine';
			oscillatorNode.frequency.value = toneFreq;
			const target = filterNodes.length > 0 ? filterNodes[0] : gainNode;
			oscillatorNode.connect(target);
			oscillatorNode.start();
		} else if (audioSource === 'file' && audioBuffer) {
			sourceNode = ctx.createBufferSource();
			sourceNode.buffer = audioBuffer;
			const target = filterNodes.length > 0 ? filterNodes[0] : gainNode;
			sourceNode.connect(target);
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
		currentTime = Math.min(
			audioContext.currentTime - startTime + pausedAt,
			audioBuffer.duration
		);
		rafId = requestAnimationFrame(tickTimeDisplay);
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
		audioContext?.close();
		audioContext = null;
	});
</script>

<div class="flex flex-col gap-2">
	<!-- Source select -->
	<select
		value={audioSource}
		onchange={(e) => {
			audioSource = (e.target as HTMLSelectElement).value;
			if (isPlaying) stop();
		}}
		class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
	>
		<option value="">{m.extension_equalizer_player_option_init()}</option>
		<option value="white">{m.extension_equalizer_player_option_white()}</option>
		<option value="pink">{m.extension_equalizer_player_option_pink()}</option>
		<option value="tone">{m.extension_equalizer_player_option_tone()}</option>
		<option value="file">{m.extension_equalizer_player_option_file()}</option>
	</select>

	<!-- Tone controls (only when tone selected) -->
	{#if audioSource === 'tone'}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-zinc-500"
				>{m.extension_equalizer_player_tone_freq_label()}<span class="font-medium"
					>{toneFreq} Hz</span
				></span
			>
			<input
				type="range"
				min="0"
				max="1000"
				step="1"
				value={Math.round(
					((Math.log10(toneFreq) - Math.log10(20)) /
						(Math.log10(20000) - Math.log10(20))) *
						1000
				)}
				oninput={(e) => {
					const v = parseFloat((e.target as HTMLInputElement).value);
					toneFreq = Math.round(
						Math.pow(
							10,
							Math.log10(20) + (v / 1000) * (Math.log10(20000) - Math.log10(20))
						)
					);
					if (oscillatorNode && isPlaying) oscillatorNode.frequency.value = toneFreq;
				}}
				class="w-full accent-zinc-700 dark:accent-zinc-300"
			/>
		</div>
	{/if}

	<!-- File upload (only when file selected) -->
	{#if audioSource === 'file'}
		<input type="file" accept="audio/*" onchange={loadFile} class="text-xs" />
		{#if fileLoaded}
			<div class="flex items-center gap-2 text-xs text-zinc-500">
				<span class="tabular-nums">{formatTime(currentTime)}</span>
				<span>/</span>
				<span class="tabular-nums">{formatTime(duration)}</span>
			</div>
		{/if}
	{/if}

	<!-- Playback controls -->
	<div class="flex items-center gap-2">
		<button
			onclick={stop}
			disabled={!audioSource}
			class="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-700"
		>⏮</button>
		<button
			onclick={togglePlay}
			disabled={!audioSource || (audioSource === 'file' && !fileLoaded)}
			class="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:hover:bg-zinc-700"
		>{isPlaying ? '⏸' : '▶'}</button>
		<!-- Volume slider -->
		<div class="flex flex-1 items-center gap-1">
			<span class="text-xs">🔊</span>
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
				class="w-full accent-zinc-700 dark:accent-zinc-300"
			/>
		</div>
	</div>

	<!-- EQ toggle -->
	<label class="flex items-center gap-2 text-xs">
		<input
			type="checkbox"
			checked={filtersEnabled}
			onchange={(e) => (filtersEnabled = (e.target as HTMLInputElement).checked)}
			class="h-3 w-3 accent-zinc-700 dark:accent-zinc-300"
		/>
		{m.extension_equalizer_player_filter_toggle()}
	</label>
</div>
