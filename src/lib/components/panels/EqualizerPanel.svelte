<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '#lib/paraglide/messages.js';
	import { eqStore } from '#lib/stores/eq-store.svelte.js';
	import { prewarmAutoEQ } from '#lib/workers/autoeq-client.js';
	import { tutorialStore } from '#lib/stores/tutorial-store.svelte.js';
	import { CircleQuestionMark } from '@lucide/svelte';

	import EqPhoneSelect from '#lib/components/equalizer/EqPhoneSelect.svelte';
	import EqFilterList from '#lib/components/equalizer/EqFilterList.svelte';
	import EqAutoEqSelect from '#lib/components/equalizer/EqAutoEqSelect.svelte';
	import EqAutoEq from '#lib/components/equalizer/EqAutoEq.svelte';
	import EqAudioPlayer from '#lib/components/equalizer/EqAudioPlayer.svelte';
	import EqSettings from '#lib/components/equalizer/EqSettings.svelte';
	import EqHistoryAndCompare from '#lib/components/equalizer/EqHistoryAndCompare.svelte';
	import Button from '../atoms/Button.svelte';
	import Switch from '../atoms/Switch.svelte';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';

	// Load turboEQ while the user is still picking a source and target, so the
	// first Run doesn't pay for the worker boot and wasm compile. Idempotent, so
	// remounting on every panel switch costs a message and nothing more.
	onMount(prewarmAutoEQ);

	// Nothing here reacts to the EQ state: this panel unmounts on every panel
	// switch, so a panel-scoped effect misses whatever happens while another
	// panel is open. The on-graph EQ curve (`dataProvider.installEqCurveSync()`)
	// and the History log (`eqHistoryStore.install()`) are installed once from
	// AppShell, and the `sourcePhoneUUID` setter resets `channelScope`.
</script>

<div class="@container/eq flex h-full flex-col">
	<div
		class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-content/20 bg-base-200 px-3 py-2"
		data-tutorial-target="eq_source"
	>
		<!-- EQ Enable toggle -->
		<Switch aria-label={m.menu_item_equalizer_label()} size="md" bind:checked={eqStore.isEnabled} />
		{#if eqStore.momentaryOverride}
			<span class="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
				{eqStore.momentaryOverride === 'bypass' ? m.eq_bypassed_label() : m.eq_auditioned_label()}
			</span>
		{/if}
		<div class="h-7 w-px bg-base-content/20"></div>
		<!-- Phone / Target select -->
		<EqPhoneSelect />
		<Button
			title={m.tutorial_eq_replay_btn()}
			variant="ghost"
			size="icon-sm"
			class="-mx-2 text-base-content/60"
			onclick={() => tutorialStore.open('equalizer')}
		>
			<CircleQuestionMark class="h-4 w-4" aria-hidden="true" />
		</Button>
	</div>
	<div
		class="flex min-h-0 flex-1 flex-col overflow-y-auto @[720px]/eq:flex-row @[720px]/eq:overflow-hidden"
	>
		<!-- Filter band editor — left column when wide -->
		<div
			class="border-b border-base-content/20 p-3 pb-4 @[720px]/eq:min-w-0 @[720px]/eq:flex-1 @[720px]/eq:overflow-y-auto @[720px]/eq:border-r @[720px]/eq:border-b-0"
			data-tutorial-target="eq_filters"
		>
			<EqFilterList />
		</div>

		<!-- Accordion group — right column when wide -->
		<div class="@[720px]/eq:min-w-0 @[720px]/eq:flex-1 @[720px]/eq:overflow-y-auto">
			<Accordion type="multiple" class="pt-1">
				<!-- AutoEQ — collapsible -->
				<AccordionItem
					value="auto-eq"
					title={m.equalizer_auto_eq_label()}
					class="px-1"
					data-tutorial-target="eq_autoeq"
				>
					<div class="flex flex-col gap-2 p-2 pt-1">
						<EqAutoEqSelect />
						<EqAutoEq />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- Audio Player — collapsible -->
				<AccordionItem
					value="audio-player"
					title={m.equalizer_player_label()}
					class="px-1"
					data-tutorial-target="eq_listen"
				>
					<div class="p-2 pt-1">
						<EqAudioPlayer />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!-- History & Compare — snapshot list + A/B switcher -->
				<AccordionItem
					value="history-compare"
					title={m.eq_history_accordion_title()}
					class="px-1"
					data-tutorial-target="eq_listen"
				>
					<div class="p-2 pt-1">
						<EqHistoryAndCompare />
					</div>
				</AccordionItem>
				<div class="my-1 h-px w-full bg-base-content/20"></div>
				<!--
					Hardware EQ — a device connected here, or the uniPEQ link. Loaded when
					the section is first opened: it only renders open, and its UI and strings
					are ~10 KB gzip most visitors never use. Not the initial-panel case
					measured and rejected in AGENTS.md.
				-->
				<AccordionItem
					value="device-peq"
					title={m.equalizer_device_peq_label()}
					class="px-1"
					data-tutorial-target="eq_hardware"
				>
					<div class="p-2 pt-1">
						{#await import('#lib/components/features/DevicePeq.svelte') then { default: DevicePeq }}
							<DevicePeq />
						{/await}
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
