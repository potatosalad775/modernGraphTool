<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import { runAutoEQInWorker } from '$lib/workers/autoeq-client.js';
	import * as m from '$lib/paraglide/messages.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';

	const opts = $derived(settingsStore.autoEqOptions);
	let isRunning = $state(false);
	/** AutoEQ has no place in graphic mode — gain-only edits, freq/Q locked. */
	const isGraphicMode = $derived(eqConstraintsStore.active?.mode === 'graphic');

	async function runAutoEQ() {
		const sourceUUID = eqStore.sourcePhoneUUID;
		const targetUUID = eqStore.autoEqTargetUUID;

		if (!sourceUUID || !targetUUID) {
			alert('Please select both a source device and target in the phone select above.');
			return;
		}

		const sourceData = frStore.get(sourceUUID);
		const targetData = frStore.get(targetUUID);

		if (!sourceData || !targetData) {
			alert('Source or target data not found.');
			return;
		}

		const getChannelData = (data: typeof sourceData) => {
			return data?.channels?.AVG?.data ?? data?.channels?.L?.data ?? data?.channels?.R?.data ?? [];
		};

		const sourcePoints = getChannelData(sourceData) as [number, number][];
		const targetPoints = getChannelData(targetData) as [number, number][];

		if (!sourcePoints.length || !targetPoints.length) {
			alert('Could not retrieve frequency response data.');
			return;
		}

		const maxFilters = Math.max(1, eqStore.filters.length);
		const options = {
			maxFilters,
			freqRange: [opts.freqMin, opts.freqMax] as [number, number],
			qRange: [opts.qMin, opts.qMax] as [number, number],
			gainRange: [opts.gainMin, opts.gainMax] as [number, number],
			useShelfFilter: opts.useShelfFilter
		};

		isRunning = true;
		try {
			const filters = await runAutoEQInWorker(sourcePoints, targetPoints, options);
			eqCommands.replaceFilters(filters);
		} catch (err) {
			console.error('AutoEQ failed:', err);
		} finally {
			isRunning = false;
		}
	}
</script>

<div class="flex flex-col gap-2 text-sm">
	<!-- Filter settings fieldset -->
	<fieldset class="rounded border border-base-content/15 px-3 py-2">
		<legend class="px-1 text-xs text-base-content/60">{m.equalizer_autoeq_filter_setting()}</legend>
		<Switch
			labelText={m.equalizer_autoeq_use_shelf_filter()}
			size="sm"
			labelClass="text-xs font-normal"
			bind:checked={settingsStore.autoEqOptions.useShelfFilter}
		/>
	</fieldset>

	<!-- Frequency Range -->
	<fieldset class="rounded border border-base-content/15 px-3 py-2">
		<legend class="px-1 text-xs text-base-content/60">{m.equalizer_autoeq_freq_range()}</legend>
		<div class="flex items-center gap-2">
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_min()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.freqMin}
				min="20"
				max="20000"
				oninput={(e) =>
					(settingsStore.autoEqOptions.freqMin =
						parseInt((e.target as HTMLInputElement).value) || settingsStore.autoEqOptions.freqMin)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_max()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.freqMax}
				min="20"
				max="20000"
				oninput={(e) =>
					(settingsStore.autoEqOptions.freqMax =
						parseInt((e.target as HTMLInputElement).value) || settingsStore.autoEqOptions.freqMax)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
		</div>
	</fieldset>

	<!-- Gain Range -->
	<fieldset class="rounded border border-base-content/15 px-3 py-2">
		<legend class="px-1 text-xs text-base-content/60">{m.equalizer_autoeq_gain_range()}</legend>
		<div class="flex items-center gap-2">
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_min()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.gainMin}
				min="-40"
				max="0"
				oninput={(e) =>
					(settingsStore.autoEqOptions.gainMin =
						parseFloat((e.target as HTMLInputElement).value) ??
						settingsStore.autoEqOptions.gainMin)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_max()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.gainMax}
				min="0"
				max="40"
				oninput={(e) =>
					(settingsStore.autoEqOptions.gainMax =
						parseFloat((e.target as HTMLInputElement).value) ??
						settingsStore.autoEqOptions.gainMax)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
		</div>
	</fieldset>

	<!-- Q Range -->
	<fieldset class="rounded border border-base-content/15 px-3 py-2">
		<legend class="px-1 text-xs text-base-content/60">{m.equalizer_autoeq_q_range()}</legend>
		<div class="flex items-center gap-2">
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_min()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.qMin}
				min="0.1"
				max="10"
				step="0.1"
				oninput={(e) =>
					(settingsStore.autoEqOptions.qMin =
						parseFloat((e.target as HTMLInputElement).value) || settingsStore.autoEqOptions.qMin)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
			<span class="text-xs text-base-content/60">{m.equalizer_autoeq_max()}</span>
			<input
				type="number"
				value={settingsStore.autoEqOptions.qMax}
				min="0.1"
				max="10"
				step="0.1"
				oninput={(e) =>
					(settingsStore.autoEqOptions.qMax =
						parseFloat((e.target as HTMLInputElement).value) || settingsStore.autoEqOptions.qMax)}
				class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
			/>
		</div>
	</fieldset>

	<p class="text-xs text-base-content/60">{m.equalizer_autoeq_description()}</p>

	<Button
		title={isGraphicMode
			? 'AutoEQ is unavailable in graphic mode (frequency and Q are locked per band)'
			: m.equalizer_autoeq_run_button()}
		onclick={runAutoEQ}
		disabled={isRunning || isGraphicMode}
		variant="primary"
	>
		{isRunning ? '...' : m.equalizer_autoeq_run_button()}
	</Button>
</div>
