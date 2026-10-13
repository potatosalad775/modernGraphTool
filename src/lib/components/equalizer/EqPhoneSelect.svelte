<script lang="ts">
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import * as m from '$lib/paraglide/messages.js';
	import SelectMenu from '../atoms/SelectMenu.svelte';
	import { deviceUUIDs, eqSelectGroups } from './eq-select-groups.js';

	const groups = $derived(eqSelectGroups('devices'));

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
	value={eqStore.sourcePhoneUUID ?? ''}
	{groups}
	onValueChange={(value) => (eqStore.sourcePhoneUUID = value || null)}
	label={m.equalizer_phone_select_source_label()}
	placeholder={m.equalizer_phone_select_option_source()}
/>
