import * as m from '$lib/paraglide/messages.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';
import type { SelectMenuGroup } from '../atoms/SelectMenu.svelte';

const isDevice = (item: FRDataObject) => item.type === 'phone' || item.type === 'inserted-phone';
const isTarget = (item: FRDataObject) => item.type === 'target' || item.type === 'inserted-target';

function itemsOf(match: (item: FRDataObject) => boolean) {
	const items: { value: string; label: string }[] = [];
	for (const [, item] of frStore.entries) {
		if (!match(item)) continue;
		items.push({ value: item.uuid, label: `${item.identifier} ${item.dispSuffix || ''}`.trim() });
	}
	return items.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Loaded curves as picker groups for the EQ panel's source and AutoEQ target
 * pickers. Both accept either kind — a target can be EQ'd, a device can be the
 * goal — so the order only says which one the picker is usually for. EQ curves
 * are never offered. Reads `frStore`, so call it inside a `$derived`.
 */
export function eqSelectGroups(first: 'devices' | 'targets'): SelectMenuGroup[] {
	const devices: SelectMenuGroup = {
		id: 'devices',
		heading: m.equalizer_phone_select_group_devices(),
		items: itemsOf(isDevice)
	};
	const targets: SelectMenuGroup = {
		id: 'targets',
		heading: m.equalizer_phone_select_group_targets(),
		items: itemsOf(isTarget)
	};
	return first === 'devices' ? [devices, targets] : [targets, devices];
}

/** UUIDs of loaded devices — the auto-pick rule considers devices only. */
export function deviceUUIDs(): string[] {
	return itemsOf(isDevice).map((i) => i.value);
}

/** UUIDs of loaded targets. */
export function targetUUIDs(): string[] {
	return itemsOf(isTarget).map((i) => i.value);
}
