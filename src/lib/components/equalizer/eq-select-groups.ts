import * as m from '$lib/paraglide/messages.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';
import { sampleRunLabel } from '$lib/utils/eq-source.js';
import type { SelectMenuGroup, SelectMenuItem } from '../atoms/SelectMenu.svelte';

const isDevice = (item: FRDataObject) => item.type === 'phone' || item.type === 'inserted-phone';
const isTarget = (item: FRDataObject) => item.type === 'target' || item.type === 'inserted-target';

const labelOf = (item: FRDataObject) => `${item.identifier} ${item.dispSuffix || ''}`.trim();

function itemsOf(match: (item: FRDataObject) => boolean): FRDataObject[] {
	const items: FRDataObject[] = [];
	for (const [, item] of frStore.entries) if (match(item)) items.push(item);
	return items.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
}

/** Separates a device from one of its runs in a picker value; a UUID never contains it. */
const RUN_SEPARATOR = '#';

/** Picker value for a device (`run` null) or one run of its sample set. */
export function sourceValue(uuid: string, run: number | null): string {
	return run === null ? uuid : `${uuid}${RUN_SEPARATOR}${run}`;
}

/** Inverse of `sourceValue`. */
export function parseSourceValue(value: string): { uuid: string; run: number | null } {
	const [uuid, run] = value.split(RUN_SEPARATOR);
	return { uuid, run: run === undefined ? null : Number(run) };
}

/**
 * One row per item; with `runs`, a sample set's row stands for its average and
 * each run with data follows it, nested. The run rows carry the device in their
 * accessible name — "Front" alone says nothing to a screen reader.
 */
function rowsOf(items: FRDataObject[], runs: boolean): SelectMenuItem[] {
	return items.flatMap((item) => {
		const label = labelOf(item);
		const runRows: SelectMenuItem[] = runs
			? (item.samples ?? []).flatMap((run, index) => {
					if (!run.L && !run.R && !run.AVG) return [];
					const runLabel = sampleRunLabel(run, index);
					return [
						{
							value: sourceValue(item.uuid, index),
							label: runLabel,
							indent: true,
							trigger: { label, detail: runLabel },
							ariaLabel: `${label} · ${runLabel}`
						}
					];
				})
			: [];
		const row: SelectMenuItem = { value: item.uuid, label };
		if (runRows.length) row.detail = m.selection_list_channel_average();
		return [row, ...runRows];
	});
}

/**
 * Loaded curves as picker groups for the EQ panel's source and AutoEQ target
 * pickers. Both accept either kind — a target can be EQ'd, a device can be the
 * goal — so the order only says which one the picker is usually for. EQ curves
 * are never offered. Only the source picker offers runs (`sourceValue`): AutoEQ
 * aims at a target, and a target is one curve. Reads `frStore`, so call it
 * inside a `$derived`.
 */
export function eqSelectGroups(first: 'devices' | 'targets'): SelectMenuGroup[] {
	const runs = first === 'devices';
	const devices: SelectMenuGroup = {
		id: 'devices',
		heading: m.equalizer_phone_select_group_devices(),
		items: rowsOf(itemsOf(isDevice), runs)
	};
	const targets: SelectMenuGroup = {
		id: 'targets',
		heading: m.equalizer_phone_select_group_targets(),
		items: rowsOf(itemsOf(isTarget), false)
	};
	return first === 'devices' ? [devices, targets] : [targets, devices];
}

/** UUIDs of loaded devices — the auto-pick rule considers devices only. */
export function deviceUUIDs(): string[] {
	return itemsOf(isDevice).map((i) => i.uuid);
}

/** UUIDs of loaded targets. */
export function targetUUIDs(): string[] {
	return itemsOf(isTarget).map((i) => i.uuid);
}
