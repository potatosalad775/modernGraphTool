import { eqStore } from '#lib/stores/eq-store.svelte.js';
import type { EqSourceContext } from './curve-traces.js';

/**
 * The `curveTraces` EQ context for one item: set while it is the enabled EQ
 * source, `null` otherwise. Lives apart from `curve-traces.ts` so that module
 * stays free of stores. Reads `eqStore`, so a `$derived` calling it re-runs
 * when the source or the picked run changes.
 */
export function eqSourceContextFor(obj: { uuid: string }): EqSourceContext | null {
	return eqStore.isEnabled && obj.uuid === eqStore.sourcePhoneUUID
		? { sample: eqStore.sourceSample }
		: null;
}
