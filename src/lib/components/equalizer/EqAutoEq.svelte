<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { autoEqService, activeGraphicBands } from '$lib/services/autoeq-service.svelte.js';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import SegmentedControl from '../atoms/SegmentedControl.svelte';

	const opts = $derived(settingsStore.autoEqOptions);
	const graphicBands = $derived(activeGraphicBands());
	const isGraphicMode = $derived(graphicBands.length > 0);

	type FitMode = 'exact' | 'autoeq';
	const fitOptions = $derived<{ value: FitMode; label: string }[]>([
		{ value: 'exact', label: m.equalizer_autoeq_exact_match() },
		{ value: 'autoeq', label: m.equalizer_autoeq_treble_safe() }
	]);

	/** The docs site only carries a Korean translation besides English. */
	const fitDocsUrl = $derived(
		`https://potatosalad775.github.io/modernGraphTool/docs/${getLocale() === 'ko' ? 'ko/' : ''}features/equalizer/#fit-mode`
	);

	const runLabel = $derived(
		autoEqService.hasResult ? m.equalizer_autoeq_recalc_button() : m.equalizer_autoeq_run_button()
	);

	const stopNotices = {
		edited: m.equalizer_autoeq_auto_apply_stopped_edited,
		input: m.equalizer_autoeq_auto_apply_stopped_input,
		preset: m.equalizer_autoeq_auto_apply_stopped_preset
	} as const;

	const statusText = $derived(
		autoEqService.fellBack
			? m.equalizer_autoeq_fallback_notice()
			: autoEqService.stopReason
				? stopNotices[autoEqService.stopReason]()
				: ''
	);
</script>

<div class="flex flex-col gap-2 text-sm">
	{#if isGraphicMode}
		<p class="text-xs text-base-content/60">
			Fitting {graphicBands.length} fixed bands — frequency and Q come from the preset, so only gain is
			optimized.
		</p>
	{/if}

	<!-- Filter settings fieldset -->
	<fieldset class="flex flex-col gap-1.5 rounded border border-base-content/15 px-3 py-2">
		<legend class="px-1 text-xs text-base-content/60">{m.equalizer_autoeq_filter_setting()}</legend>
		<div class="-mr-1.25 flex items-center gap-1">
			<SegmentedControl
				class="flex-1"
				label={m.equalizer_autoeq_fit_mode()}
				options={fitOptions}
				value={opts.exactMatch ? 'exact' : 'autoeq'}
				onValueChange={(mode) => (settingsStore.autoEqOptions.exactMatch = mode === 'exact')}
			/>
			<PopoverPanel align="end">
				{#snippet trigger({ props })}
					<Button
						{...props}
						title={m.equalizer_autoeq_fit_help()}
						variant="ghost"
						size="icon-xs"
						activeOnOpen
						class="opacity-80 hover:opacity-100"
					>
						<CircleAlert class="h-3.5 w-3.5" />
					</Button>
				{/snippet}
				<div class="flex max-w-xs flex-col gap-2 p-1 text-xs text-base-content">
					<p>
						<span class="font-semibold">{m.equalizer_autoeq_exact_match()}</span>
						— {m.equalizer_autoeq_exact_match_hint()}
					</p>
					<p>
						<span class="font-semibold">{m.equalizer_autoeq_treble_safe()}</span>
						— {m.equalizer_autoeq_treble_safe_hint()}
					</p>
					<a
						href={fitDocsUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="self-start text-accent underline underline-offset-2"
					>
						{m.equalizer_autoeq_learn_more()}
					</a>
				</div>
			</PopoverPanel>
		</div>
		{#if !isGraphicMode}
			<Switch
				labelText={m.equalizer_autoeq_use_shelf_filter()}
				size="sm"
				labelClass="text-xs font-normal"
				bind:checked={settingsStore.autoEqOptions.useShelfFilter}
			/>
		{/if}
	</fieldset>

	{#if !isGraphicMode}
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
							parseInt((e.target as HTMLInputElement).value) ||
							settingsStore.autoEqOptions.freqMin)}
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
							parseInt((e.target as HTMLInputElement).value) ||
							settingsStore.autoEqOptions.freqMax)}
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
	{/if}

	<p class="text-xs text-base-content/60">{m.equalizer_autoeq_description()}</p>

	<!--
		One button element throughout, relabelled rather than swapped out, so
		keyboard focus survives the first run.
	-->
	<div class="flex items-center gap-3">
		<Switch
			labelText={m.equalizer_autoeq_auto_apply()}
			title={m.equalizer_autoeq_auto_apply_hint()}
			size="sm"
			labelClass="text-xs font-normal"
			disabled={autoEqService.fellBack || !eqStore.sourcePhoneUUID || !eqStore.autoEqTargetUUID}
			bind:checked={() => autoEqService.autoApply, (on) => autoEqService.setAutoApply(on)}
		/>
		<Button
			title={runLabel}
			onclick={() => autoEqService.run()}
			disabled={autoEqService.isRunning}
			variant="primary"
			size="sm"
			class="flex-1"
		>
			{autoEqService.isRunning ? '...' : runLabel}
		</Button>
	</div>

	<p role="status" class="text-xs text-base-content/70 empty:hidden">{statusText}</p>
</div>
