<script lang="ts">
	import { audioSpectrumStore } from '$lib/stores/audio-spectrum-store.svelte.js';
	import { audioRangeStore } from '$lib/stores/audio-range-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import {
		audioPlayerService,
		type AudioSource
	} from '$lib/services/audio-player-service.svelte.js';
	import * as m from '$lib/paraglide/messages.js';
	import Button from '$lib/components/atoms/Button.svelte';
	import {
		FileUp,
		Pause,
		Play,
		Square,
		VolumeX,
		Volume2,
		CircleAlert,
		Trash2
	} from '@lucide/svelte';
	import Switch from '../atoms/Switch.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	// In frequency-selection mode the single-frequency sources are constrained to the
	// selected band — the range gates them by moving them, not by filtering them. The
	// tone slider maps across the band, otherwise most of its travel would clamp to the
	// endpoints. The sweep spans the band outright, so it hides its own From/To inputs
	// rather than showing a second, identically labelled pair of the same numbers that
	// the next graph drag would overwrite.
	const bandMinHz = $derived(
		audioRangeStore.isFrequencySelectionMode ? audioRangeStore.fromHz : 20
	);
	const bandMaxHz = $derived(
		audioRangeStore.isFrequencySelectionMode ? audioRangeStore.toHz : 20000
	);

	function toneSliderPos(hz: number, min: number, max: number): number {
		const lo = Math.log10(min);
		const span = Math.log10(max) - lo;
		if (span <= 0) return 0;
		return Math.min(1000, Math.max(0, Math.round(((Math.log10(hz) - lo) / span) * 1000)));
	}

	function toneSliderHz(pos: number, min: number, max: number): number {
		const lo = Math.log10(min);
		return Math.round(Math.pow(10, lo + (pos / 1000) * (Math.log10(max) - lo)));
	}

	function formatTime(seconds: number): string {
		const min = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${min}:${String(s).padStart(2, '0')}`;
	}

	async function onFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) await audioPlayerService.loadFile(file);
	}
</script>

<div class="flex flex-col gap-3">
	<!-- EQ toggle / spectrum toggle / range-mode toggle -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
		<Switch
			title={!eqStore.isEnabled
				? 'Turn the Equalizer on to apply EQ filters to playback'
				: audioPlayerService.filtersEnabled
					? 'Disable EQ filters'
					: 'Enable EQ filters'}
			labelText={m.equalizer_player_filter_toggle()}
			labelClass="text-xs"
			size="sm"
			disabled={!eqStore.isEnabled}
			checked={audioPlayerService.filtersEnabled}
			onCheckedChange={(checked) => audioPlayerService.setFiltersEnabled(checked)}
		/>
		<Switch
			title={audioSpectrumStore.isEnabled ? 'Hide audio spectrum' : 'Show audio spectrum'}
			labelText={m.equalizer_player_spectrum_toggle()}
			labelClass="text-xs"
			size="sm"
			bind:checked={audioSpectrumStore.isEnabled}
		/>
		<Switch
			title="Drag a range on the graph to focus playback on a frequency band — noise and files are band-passed, a tone or sweep is clamped into it. Disables EQ-node interaction while active."
			labelText={m.equalizer_player_freq_select_toggle()}
			labelClass="text-xs"
			size="sm"
			bind:checked={audioRangeStore.isFrequencySelectionMode}
		>
			<PopoverPanel>
				{#snippet trigger({ props })}
					<Button
						{...props}
						title="Open 'Frequency range' option description"
						variant="ghost"
						size="icon-xs"
						activeOnOpen
						class="ml-0.5 opacity-80 hover:opacity-100"
					>
						<CircleAlert class="h-3 w-3" />
					</Button>
				{/snippet}
				<p class="max-w-xs text-xs text-base-content">
					{m.equalizer_player_freq_select_hint()}
				</p>
			</PopoverPanel>
		</Switch>
	</div>

	<!-- Range From/To inputs (only when frequency-selection mode is active) -->
	{#if audioRangeStore.isFrequencySelectionMode}
		<div class="flex items-center gap-2 text-xs text-base-content/60">
			<label class="flex items-baseline gap-1">
				{m.equalizer_player_sweep_from_label()}
				<input
					type="number"
					min="20"
					max="20000"
					step="1"
					value={audioRangeStore.fromHz}
					onchange={(e) => {
						const v = parseInt((e.target as HTMLInputElement).value);
						if (!isNaN(v)) audioRangeStore.setRange(v, audioRangeStore.toHz);
					}}
					class="w-16 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-right tabular-nums focus:ring-1 focus:ring-accent focus:outline-none"
				/>
				<span class="text-[10px]">Hz</span>
			</label>
			<label class="flex items-baseline gap-1">
				{m.equalizer_player_sweep_to_label()}
				<input
					type="number"
					min="20"
					max="20000"
					step="1"
					value={audioRangeStore.toHz}
					onchange={(e) => {
						const v = parseInt((e.target as HTMLInputElement).value);
						if (!isNaN(v)) audioRangeStore.setRange(audioRangeStore.fromHz, v);
					}}
					class="w-16 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-right tabular-nums focus:ring-1 focus:ring-accent focus:outline-none"
				/>
				<span class="text-[10px]">Hz</span>
			</label>
			<div class="h-px flex-1 bg-base-content/20"></div>
			<Button
				title={m.equalizer_player_freq_select_reset()}
				onclick={() => audioRangeStore.reset()}
				variant="destructive"
				size="icon-xs"
				class="ml-0.5"
			>
				<Trash2 class="size-3.5" />
			</Button>
		</div>
	{/if}

	<!-- Source select -->
	<select
		value={audioPlayerService.audioSource}
		onchange={(e) =>
			audioPlayerService.setAudioSource((e.target as HTMLSelectElement).value as AudioSource)}
		class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
	>
		<option value="">{m.equalizer_player_option_init()}</option>
		<option value="white">{m.equalizer_player_option_white()}</option>
		<option value="pink">{m.equalizer_player_option_pink()}</option>
		<option value="tone">{m.equalizer_player_option_tone()}</option>
		<option value="sweep">{m.equalizer_player_option_sweep()}</option>
		<option value="file">{m.equalizer_player_option_file()}</option>
	</select>

	<!-- Tone controls (only when tone selected) -->
	{#if audioPlayerService.audioSource === 'tone'}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-base-content/60"
				>{m.equalizer_player_tone_freq_label()}<span class="font-medium"
					>{audioPlayerService.toneFreq} Hz</span
				></span
			>
			<input
				type="range"
				min="0"
				max="1000"
				step="1"
				value={toneSliderPos(audioPlayerService.toneFreq, bandMinHz, bandMaxHz)}
				oninput={(e) =>
					audioPlayerService.setToneFreq(
						toneSliderHz(parseFloat((e.target as HTMLInputElement).value), bandMinHz, bandMaxHz)
					)}
				class="w-full accent-accent"
			/>
		</div>
	{/if}

	<!-- Sweep controls (only when sweep selected) -->
	{#if audioPlayerService.audioSource === 'sweep'}
		<div class="flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
				<!-- In range mode the band *is* the sweep span, and the Range From/To pair
				     above already edits it — a second pair here would carry the same labels
				     and the same numbers. -->
				{#if !audioRangeStore.isFrequencySelectionMode}
					<label class="flex items-baseline gap-1">
						{m.equalizer_player_sweep_from_label()}
						<input
							type="number"
							min="20"
							max="20000"
							step="1"
							value={audioPlayerService.sweepFromHz}
							onchange={(e) => {
								const v = parseInt((e.target as HTMLInputElement).value);
								if (!isNaN(v)) audioPlayerService.setSweepFromHz(v);
							}}
							class="w-16 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-right tabular-nums focus:ring-1 focus:ring-accent focus:outline-none"
						/>
						<span class="text-[10px]">Hz</span>
					</label>
					<label class="flex items-baseline gap-1">
						{m.equalizer_player_sweep_to_label()}
						<input
							type="number"
							min="20"
							max="20000"
							step="1"
							value={audioPlayerService.sweepToHz}
							onchange={(e) => {
								const v = parseInt((e.target as HTMLInputElement).value);
								if (!isNaN(v)) audioPlayerService.setSweepToHz(v);
							}}
							class="w-16 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-right tabular-nums focus:ring-1 focus:ring-accent focus:outline-none"
						/>
						<span class="text-[10px]">Hz</span>
					</label>
				{/if}
				<label class="flex items-baseline gap-1">
					{m.equalizer_player_sweep_duration_label()}
					<input
						type="number"
						min="0.5"
						max="60"
						step="0.5"
						value={audioPlayerService.sweepDurationSec}
						onchange={(e) => {
							const v = parseFloat((e.target as HTMLInputElement).value);
							if (!isNaN(v)) audioPlayerService.setSweepDurationSec(v);
						}}
						class="w-12 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-right tabular-nums focus:ring-1 focus:ring-accent focus:outline-none"
					/>
					<span class="text-[10px]">s</span>
				</label>
				<Switch
					labelText={m.equalizer_player_sweep_loop_label()}
					labelClass="text-xs"
					size="sm"
					checked={audioPlayerService.sweepLoop}
					onCheckedChange={(checked) => audioPlayerService.setSweepLoop(checked)}
				/>
			</div>
			{#if audioPlayerService.isPlaying}
				<span class="text-xs text-base-content/60 tabular-nums">
					{audioPlayerService.sweepCurrentHz} Hz
				</span>
			{/if}
		</div>
	{/if}

	<!-- File upload (only when file selected) -->
	{#if audioPlayerService.audioSource === 'file'}
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
			onchange={onFileChange}
		/>
		{#if audioPlayerService.fileLoaded}
			<div class="flex items-center gap-2 text-xs text-base-content/60">
				<span class="tabular-nums">{formatTime(audioPlayerService.currentTime)}</span>
				<input
					type="range"
					min="0"
					max={audioPlayerService.duration}
					step="0.1"
					value={audioPlayerService.currentTime}
					oninput={(e) =>
						audioPlayerService.seekTo(parseFloat((e.target as HTMLInputElement).value))}
					class="flex-1 accent-accent"
				/>
				<span class="tabular-nums">{formatTime(audioPlayerService.duration)}</span>
			</div>
		{/if}
	{/if}

	<!-- Playback controls -->
	<div class="flex items-center gap-1.5">
		<Button
			title="Stop Audio"
			onclick={() => audioPlayerService.stop()}
			disabled={!audioPlayerService.audioSource}
			variant="muted"
			size="icon"
		>
			<Square class="size-3.5" />
		</Button>
		<Button
			title={audioPlayerService.isPlaying ? 'Pause Audio' : 'Play Audio'}
			onclick={() => audioPlayerService.togglePlay()}
			disabled={!audioPlayerService.audioSource ||
				(audioPlayerService.audioSource === 'file' && !audioPlayerService.fileLoaded)}
			variant="muted"
			size="icon"
		>
			{#if audioPlayerService.isPlaying}
				<Pause class="size-3.5" />
			{:else}
				<Play class="size-3.5" />
			{/if}
		</Button>
		<div class="mx-1 h-5 w-px bg-base-content/30"></div>
		<!-- Volume slider -->
		<div class="flex flex-1 items-center gap-1">
			{#if audioPlayerService.volume == 0}
				<VolumeX class="size-3.5 text-base-content/60" />
			{:else}
				<Volume2 class="size-3.5" />
			{/if}
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={audioPlayerService.volume}
				oninput={(e) =>
					audioPlayerService.setVolume(parseFloat((e.target as HTMLInputElement).value))}
				class="w-full accent-accent"
			/>
		</div>
	</div>
</div>
