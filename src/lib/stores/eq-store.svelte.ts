import { SvelteMap } from 'svelte/reactivity';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { ParsedFRData } from '$lib/types/data-types.js';

export type { EQFilter };

class EQStore {
	filters = $state<EQFilter[]>([]);
	preamp = $state(0);
	isEnabled = $state(false);
	/** UUID of the phone to apply EQ to (EQ preview) */
	sourcePhoneUUID = $state<string | null>(null);
	/** UUID of the target curve used for AutoEQ calculation */
	autoEqTargetUUID = $state<string | null>(null);
	/** UUID of the EQ-modified FRDataObject in frStore */
	eqCurveUUID = $state<string | null>(null);
	/**
	 * Direction of the `\` momentary EQ override while the key is held, else null.
	 * `bypass` — EQ was on and is temporarily off; `audition` — EQ was off and is
	 * temporarily on. Drives a transient badge so the two directions read differently.
	 */
	momentaryOverride = $state<'bypass' | 'audition' | null>(null);
	/** EQ-modified FR data (pre-normalization) — used for overlay node positioning */
	readonly eqModifiedData = new SvelteMap<string, ParsedFRData>();

	updateBandAt(index: number, partial: Partial<EQFilter>): void {
		if (index < 0 || index >= this.filters.length) return;
		const filters = [...this.filters];
		filters[index] = { ...filters[index], ...partial };
		this.filters = filters;
	}

	addBand(band: EQFilter): void {
		this.filters = [...this.filters, band];
	}

	removeBandAt(index: number): void {
		this.filters = this.filters.filter((_, i) => i !== index);
	}
}

export const eqStore = new EQStore();
