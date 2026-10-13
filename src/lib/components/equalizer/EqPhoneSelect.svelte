<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import * as m from '$lib/paraglide/messages.js';
	import { eqSourceRun } from '$lib/utils/eq-source.js';
	import SelectMenu from '../atoms/SelectMenu.svelte';
	import {
		deviceUUIDs,
		eqSelectGroups,
		parseSourceValue,
		sourceValue
	} from './eq-select-groups.js';

	const groups = $derived(eqSelectGroups('devices'));

	/** A stale run pick (another variant now) reads as the average, as the EQ does. */
	const value = $derived.by(() => {
		const uuid = eqStore.sourcePhoneUUID;
		if (!uuid) return '';
		const run = eqSourceRun(frStore.get(uuid), eqStore.sourceSample);
		return sourceValue(uuid, run ? eqStore.sourceSample!.index : null);
	});

	function select(next: string) {
		if (!next) {
			eqStore.sourcePhoneUUID = null;
			return;
		}
		const { uuid, run } = parseSourceValue(next);
		// Setting the device first: a new device drops the previous run pick.
		eqStore.sourcePhoneUUID = uuid;
		eqStore.sourceSample =
			run === null ? null : { index: run, variant: frStore.get(uuid)?.dispSuffix ?? '' };
	}

	$effect(() => {
		const uuids = new Set(groups.flatMap((g) => g.items.map((i) => i.value)));
		if (eqStore.sourcePhoneUUID && !uuids.has(eqStore.sourcePhoneUUID)) {
			eqStore.sourcePhoneUUID = null;
		}
		if (eqStore.sourcePhoneUUID === null) {
			const phones = deviceUUIDs();
			if (phones.length === 1) eqStore.sourcePhoneUUID = phones[0];
		}
	});
</script>

<SelectMenu
	class="flex-1"
	{value}
	{groups}
	onValueChange={select}
	label={m.equalizer_phone_select_source_label()}
	placeholder={m.equalizer_phone_select_option_source()}
/>
