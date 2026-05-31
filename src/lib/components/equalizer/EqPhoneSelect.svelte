<script lang="ts">
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';

	const sourceOptions = $derived.by(() => {
		const _size = frStore.size;
		const opts: { uuid: string; label: string }[] = [];
		for (const [, item] of frStore.entries) {
			if (item.type !== 'eq' && item.type !== 'inserted-eq') {
				opts.push({
					uuid: item.uuid,
					label: `${item.identifier} ${item.dispSuffix || ''}`.trim()
				});
			}
		}
		// Sort phones first, then targets, all alphabetically by label
		return opts.sort((a, b) => {
			const itemA = frStore.get(a.uuid);
			const itemB = frStore.get(b.uuid);
			if (!itemA || !itemB) return 0;
			if (itemA.type === 'phone' && itemB.type !== 'phone') return -1;
			if (itemA.type !== 'phone' && itemB.type === 'phone') return 1;
			return a.label.localeCompare(b.label);
		});
	});

	$effect(() => {
		const uuids = new Set(sourceOptions.map((o) => o.uuid));
		if (eqStore.sourcePhoneUUID && !uuids.has(eqStore.sourcePhoneUUID)) {
			eqStore.sourcePhoneUUID = null;
		}
		if (eqStore.sourcePhoneUUID === null) {
			const phones: string[] = [];
			for (const [, item] of frStore.entries) {
				if (item.type === 'phone' || item.type === 'inserted-phone') phones.push(item.uuid);
			}
			if (phones.length === 1) eqStore.sourcePhoneUUID = phones[0];
		}
	});

	// Auto-pick a device-specific constraint preset when the source phone
	// matches its `matchPhones` substrings. The store no-ops unless the
	// current preset is `default`, so manual picks and connected hardware
	// devices are respected.
	$effect(() => {
		const uuid = eqStore.sourcePhoneUUID;
		if (!uuid) return;
		const item = frStore.get(uuid);
		if (!item) return;
		const matched = eqConstraintsStore.applyPhoneMatch(item.identifier);
		if (matched) eqCommands.reclampToActiveConstraint();
	});
</script>

<select
	value={eqStore.sourcePhoneUUID ?? ''}
	onchange={(e) => {
		eqStore.sourcePhoneUUID = (e.target as HTMLSelectElement).value || null;
	}}
	class="min-w-16 flex-1 rounded border border-base-content/20 bg-base-100 px-2 py-1 text-sm hover:cursor-pointer hover:bg-base-content/5"
>
	<option value="">{m.equalizer_phone_select_option_source()}</option>
	{#each sourceOptions as opt (opt.uuid)}
		<option value={opt.uuid}>{opt.label}</option>
	{/each}
</select>
