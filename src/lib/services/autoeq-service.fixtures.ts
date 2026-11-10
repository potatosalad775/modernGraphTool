/**
 * What `autoeq-service.svelte.spec.ts` and `EqAutoEq.svelte.spec.ts` both need: a source and a
 * target in `frStore`, the worker's canned answer, and the store reset that keeps the shared
 * `autoEqService` singleton from leaking one test into the next.
 */
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { autoEqService } from '#lib/services/autoeq-service.svelte.js';
import { commandHistory } from '#lib/services/command-history.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';
import type { EQFilter } from '#lib/utils/equalizer.js';

export const RESULT: EQFilter[] = [{ type: 'PK', freq: 1000, gain: -3, q: 1, enabled: true }];
/** What the worker hands back: the bands, plus which optimizer found them. */
export const OUTCOME = { filters: RESULT, engine: 'turboeq' as const, rmse: 0.42, preamp: -3 };

export const DEFAULT_OPTS = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true,
	exactMatch: true
};

export function curve(level: number): [number, number][] {
	return [
		[20, level],
		[1000, level],
		[20000, level]
	];
}

export function makeItem(
	uuid: string,
	type: FRDataObject['type'],
	data: [number, number][]
): FRDataObject {
	return {
		uuid,
		type,
		identifier: uuid,
		channels: { AVG: { data } }
	} as unknown as FRDataObject;
}

/** Seeds a source phone and an AutoEQ target and points the store at both. */
export function seedPair(): void {
	frStore.set('src', makeItem('src', 'phone', curve(6)));
	frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
	eqStore.sourcePhoneUUID = 'src';
	eqStore.autoEqTargetUUID = 'tgt';
}

/** Back to a blank slate: no curves, no filters, default options, default preset. */
export function resetAutoEqStores(): void {
	frStore.entries.clear();
	eqStore.filters = [];
	eqStore.channelScope = 'BOTH';
	eqStore.sourcePhoneUUID = null;
	eqStore.autoEqTargetUUID = null;
	eqStore.isEnabled = false;
	eqStore.momentaryOverride = null;
	eqStore.momentaryRestore = null;
	settingsStore.autoEqOptions = { ...DEFAULT_OPTS };
	autoEqService.reset();
	commandHistory.clear();
	eqConstraintsStore.presets = [...BUILTIN_PRESETS];
	eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
}
