<script lang="ts">
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqHistoryStore } from '$lib/stores/eq-history-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';

	import EqPhoneSelect from '$lib/components/equalizer/EqPhoneSelect.svelte';
	import EqFilterList from '$lib/components/equalizer/EqFilterList.svelte';
	import EqAutoEqSelect from '$lib/components/equalizer/EqAutoEqSelect.svelte';
	import EqAutoEq from '$lib/components/equalizer/EqAutoEq.svelte';
	import EqAudioPlayer from '$lib/components/equalizer/EqAudioPlayer.svelte';
	import EqSettings from '$lib/components/equalizer/EqSettings.svelte';
	import EqConstraintSelect from '$lib/components/equalizer/EqConstraintSelect.svelte';
	import EqHistoryAndCompare from '$lib/components/equalizer/EqHistoryAndCompare.svelte';
	import DevicePeq from '$lib/components/features/DevicePeq.svelte';
	import Switch from '../atoms/Switch.svelte';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';

	let prevSourceUUID: string | null = null;

	// Cleanup when sourcePhoneUUID changes — also drop the EQ snapshot history
	// since snapshots are session-scoped to a particular source phone.
	$effect(() => {
		const currentUUID = eqStore.sourcePhoneUUID;
		const prev = prevSourceUUID;
		prevSourceUUID = currentUUID;
		if (prev && prev !== currentUUID) {
			untrack(() => {
				dataProvider.rebuildEqCurve();
				eqHistoryStore.clear();
			});
		}
	});

	// EQ preview effect — tracks the reactive inputs and delegates the actual
	// curve construction to dataProvider.rebuildEqCurve(), which is the single
	// source of truth for EQ curve math (shared with renormalizeAll).
	$effect(() => {
		// Track dependencies reactively
		const sourceUUID = eqStore.sourcePhoneUUID;
		void eqStore.isEnabled;
		void eqStore.filters;
		void eqStore.preamp;
		void settingsStore.linkEqNormalization;
		// Re-fire when the source phone data itself changes (e.g. after renormalizeAll)
		if (sourceUUID) void frStore.get(sourceUUID);

		untrack(() => dataProvider.rebuildEqCurve());
	});

	// Record snapshots of the EQ state for the History & Compare UI.
	// Debounced + min-gapped inside the store so a slider drag becomes one
	// entry, not 60. Doesn't fire on phone-source change since clear() above
	// resets the log first.
	$effect(() => {
		void eqStore.filters;
		void eqStore.preamp;
		untrack(() => eqHistoryStore.record(eqStore.filters, eqStore.preamp));
	});
</script>

<div class="@container/eq flex h-full flex-col">
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-content/20 bg-base-200 px-3 py-2"
	>
		<!-- EQ Enable toggle -->
		<Switch labelText={m.menu_item_equalizer_label()} size="md" bind:checked={eqStore.isEnabled} />
		{#if eqStore.isMomentarilyBypassed}
			<span class="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
				{m.eq_bypassed_label()}
			</span>
		{/if}
		<div class="h-7 w-px bg-base-content/20"></div>
		<!-- Phone / Target select -->
		<EqPhoneSelect />
		<!-- Constraint preset picker -->
		<EqConstraintSelect />
	</div>
	<div
		class="flex min-h-0 flex-1 flex-col overflow-y-auto @[720px]/eq:flex-row @[720px]/eq:overflow-hidden"
	>
		<!-- Filter band editor — left column when wide -->
		<div
			class="border-b border-base-content/20 p-3 pb-4 @[720px]/eq:min-w-0 @[720px]/eq:flex-1 @[720px]/eq:overflow-y-auto @[720px]/eq:border-r @[720px]/eq:border-b-0"
		>
			<EqFilterList />
		</div>

		<!-- Accordion group — right column when wide -->
		<div class="@[720px]/eq:min-w-0 @[720px]/eq:flex-1 @[720px]/eq:overflow-y-auto">
			<Accordion type="multiple" class="pt-1">
				<!-- AutoEQ — collapsible -->
				<AccordionItem value="auto-eq" title={m.equalizer_auto_eq_label()} class="px-1">
					<div class="flex flex-col gap-2 p-2 pt-1">
						<EqAutoEqSelect />
						<EqAutoEq />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- Audio Player — collapsible -->
				<AccordionItem value="audio-player" title={m.equalizer_player_label()} class="px-1">
					<div class="p-2 pt-1">
						<EqAudioPlayer />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- History & Compare — snapshot list + A/B switcher -->
				<AccordionItem value="history-compare" title={m.eq_history_accordion_title()} class="px-1">
					<div class="p-2 pt-1">
						<EqHistoryAndCompare />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- Device PEQ — USB/Network hardware EQ bridge -->
				<AccordionItem value="device-peq" title={m.equalizer_device_peq_label()} class="px-1">
					<div class="p-2 pt-1">
						<DevicePeq />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- EQ Settings — AutoEQ persist + Link-EQ-normalization -->
				<AccordionItem value="eq-settings" title={m.eq_settings_accordion_title()} class="px-1">
					<div class="p-2 pt-1">
						<EqSettings />
					</div>
				</AccordionItem>
				<div class="mt-1 h-px w-full bg-base-content/20"></div>
			</Accordion>
		</div>
	</div>
</div>
