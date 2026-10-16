<script lang="ts">
	import { eqStore } from '#lib/stores/eq-store.svelte.js';
	import * as m from '#lib/paraglide/messages.js';
	import SelectMenu from '../atoms/SelectMenu.svelte';
	import { eqSelectGroups, targetUUIDs } from './eq-select-groups.js';

	const groups = $derived(eqSelectGroups('targets'));

	$effect(() => {
		const uuids = new Set(groups.flatMap((g) => g.items.map((i) => i.value)));
		if (eqStore.autoEqTargetUUID && !uuids.has(eqStore.autoEqTargetUUID)) {
			eqStore.autoEqTargetUUID = null;
		}
		if (eqStore.autoEqTargetUUID === null) {
			const targets = targetUUIDs();
			if (targets.length === 1) eqStore.autoEqTargetUUID = targets[0];
		}
	});
</script>

<SelectMenu
	class="w-full"
	value={eqStore.autoEqTargetUUID ?? ''}
	{groups}
	onValueChange={(value) => (eqStore.autoEqTargetUUID = value || null)}
	label={m.equalizer_phone_select_target_label()}
	placeholder={m.equalizer_phone_select_option_target()}
/>
