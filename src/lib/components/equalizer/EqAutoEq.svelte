<script lang="ts">
	import { eqStore } from '#lib/stores/eq-store.svelte.js';
	import { settingsStore } from '#lib/stores/settings-store.svelte.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { autoEqService, activeGraphicBands } from '#lib/services/autoeq-service.svelte.js';
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Switch from '../atoms/Switch.svelte';
	import Button from '../atoms/Button.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';
	import SegmentedControl from '../atoms/SegmentedControl.svelte';
	import { parseBounded } from '#lib/utils/number-field.js';

	const uid = $props.id();
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

	/**
	 * Fit mode is turboEQ's alone — the fallback has one mode, which is what
	 * exact match reproduces. Hidden only once the module has failed to load:
	 * when turboEQ merely refused a request, switching the mode is often what
	 * gets it back.
	 */
	const showFitMode = $derived(autoEqService.fallback !== 'unavailable');

	function fallbackNotice(): string {
		const unavailable = autoEqService.fallback === 'unavailable';
		if (!autoEqService.unfitted) {
			return unavailable
				? m.equalizer_autoeq_fallback_notice()
				: m.equalizer_autoeq_fallback_rejected_notice();
		}
		// Only a graphic EQ goes unfitted, and the notice is about that preset.
		if (!isGraphicMode) return '';
		return unavailable
			? m.equalizer_autoeq_graphic_unavailable_notice()
			: m.equalizer_autoeq_graphic_rejected_notice();
	}

	type RangeKey = 'freqMin' | 'freqMax' | 'gainMin' | 'gainMax' | 'qMin' | 'qMax';

	/** Each bound's field limits (kept in step with the inputs' min/max) and its pair partner. */
	const RANGE_FIELDS: Record<
		RangeKey,
		{ min: number; max: number; step?: number; integer?: boolean; partner: RangeKey }
	> = {
		freqMin: { min: 20, max: 20000, integer: true, partner: 'freqMax' },
		freqMax: { min: 20, max: 20000, integer: true, partner: 'freqMin' },
		gainMin: { min: -40, max: 0, partner: 'gainMax' },
		gainMax: { min: 0, max: 40, partner: 'gainMin' },
		qMin: { min: 0.1, max: 10, step: 0.1, partner: 'qMax' },
		qMax: { min: 0.1, max: 10, step: 0.1, partner: 'qMin' }
	};

	/**
	 * Commits on `change`, not per keystroke: typing `5` on the way to `500` must not set a
	 * frequency of 5. Text that isn't a number is dropped, a number is clamped to the field and to
	 * its partner (min never above max), and the box is then re-synced with what was stored — the
	 * `value` attribute alone wouldn't redraw when the stored number is unchanged.
	 */
	function commitRange(e: Event, key: RangeKey) {
		const input = e.currentTarget as HTMLInputElement;
		const f = RANGE_FIELDS[key];
		const partner = settingsStore.autoEqOptions[f.partner];
		const isMin = key.endsWith('Min');
		const v = parseBounded(
			input.value,
			isMin ? f.min : Math.max(f.min, partner),
			isMin ? Math.min(f.max, partner) : f.max,
			f.integer
		);
		if (v !== null) settingsStore.autoEqOptions[key] = v;
		input.value = String(settingsStore.autoEqOptions[key]);
	}

	const statusText = $derived(
		autoEqService.fellBack
			? fallbackNotice()
			: autoEqService.stopReason
				? stopNotices[autoEqService.stopReason]()
				: ''
	);
</script>

{#snippet rangeBound(key: RangeKey)}
	<span id="{uid}-{key}" class="text-xs text-base-content/60">
		{key.endsWith('Min') ? m.equalizer_autoeq_min() : m.equalizer_autoeq_max()}
	</span>
	{@render rangeInput(key)}
{/snippet}

{#snippet rangeInput(key: RangeKey)}
	{@const f = RANGE_FIELDS[key]}
	<!-- Named by its group's legend plus its own Min / Max label: "Frequency Range Min". -->
	<input
		type="number"
		aria-labelledby="{uid}-{key.slice(0, -3)}-legend {uid}-{key}"
		value={settingsStore.autoEqOptions[key]}
		min={f.min}
		max={f.max}
		step={f.step}
		onchange={(e) => commitRange(e, key)}
		class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:ring-1 focus:ring-accent focus:outline-none"
	/>
{/snippet}

<div class="flex flex-col gap-2 text-sm">
	{#if isGraphicMode}
		<p class="text-xs text-base-content/60">
			{m.equalizer_autoeq_graphic_note({ count: graphicBands.length })}
		</p>
	{/if}

	<!-- Filter settings fieldset -->
	{#if showFitMode || !isGraphicMode}
		<fieldset class="flex flex-col gap-1.5 rounded border border-base-content/15 px-3 py-2">
			<legend class="px-1 text-xs text-base-content/60">
				{m.equalizer_autoeq_filter_setting()}
			</legend>
			{#if showFitMode}
				<div class="-mr-1.25 flex items-center gap-1">
					<SegmentedControl
						class="flex-1"
						label={m.equalizer_autoeq_fit_mode()}
						options={fitOptions}
						value={opts.exactMatch ? 'exact' : 'autoeq'}
						onValueChange={(mode) => (settingsStore.autoEqOptions.exactMatch = mode === 'exact')}
					/>
					<InfoPopover label={m.equalizer_autoeq_fit_help()} align="end">
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
							rel="external noopener noreferrer"
							class="self-start text-accent underline underline-offset-2"
						>
							{m.equalizer_autoeq_learn_more()}
						</a>
					</InfoPopover>
				</div>
			{/if}
			{#if !isGraphicMode}
				<Switch
					labelText={m.equalizer_autoeq_use_shelf_filter()}
					size="sm"
					labelClass="text-xs font-normal"
					bind:checked={settingsStore.autoEqOptions.useShelfFilter}
				/>
			{/if}
		</fieldset>
	{/if}

	{#if !isGraphicMode}
		<!-- Frequency Range -->
		<fieldset class="rounded border border-base-content/15 px-3 py-2">
			<legend id="{uid}-freq-legend" class="px-1 text-xs text-base-content/60"
				>{m.equalizer_autoeq_freq_range()}</legend
			>
			<div class="flex items-center gap-2">
				{@render rangeBound('freqMin')}
				{@render rangeBound('freqMax')}
			</div>
		</fieldset>

		<!-- Gain Range -->
		<fieldset class="rounded border border-base-content/15 px-3 py-2">
			<legend id="{uid}-gain-legend" class="px-1 text-xs text-base-content/60"
				>{m.equalizer_autoeq_gain_range()}</legend
			>
			<div class="flex items-center gap-2">
				{@render rangeBound('gainMin')}
				{@render rangeBound('gainMax')}
			</div>
		</fieldset>

		<!-- Q Range -->
		<fieldset class="rounded border border-base-content/15 px-3 py-2">
			<legend id="{uid}-q-legend" class="px-1 text-xs text-base-content/60"
				>{m.equalizer_autoeq_q_range()}</legend
			>
			<div class="flex items-center gap-2">
				{@render rangeBound('qMin')}
				{@render rangeBound('qMax')}
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
			label={autoEqService.isRunning ? '...' : runLabel}
			aria-label={runLabel}
			aria-busy={autoEqService.isRunning}
			onclick={() => autoEqService.run()}
			disabled={autoEqService.isRunning || linkStore.readOnly}
			variant="primary"
			size="sm"
			class="flex-1"
		/>
	</div>

	<p
		role="status"
		aria-busy={autoEqService.isRunning}
		class="text-xs text-base-content/70 empty:hidden"
	>
		{statusText}
	</p>
</div>
