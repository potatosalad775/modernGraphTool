import type { Profile } from '@potatosalad775/eqcaps-core';

/**
 * One entry in the EQ constraint picker: an eqcaps profile plus where it came from.
 *
 * The limits themselves are an eqcaps `Profile` (format v1, `@potatosalad775/eqcaps-core`): band
 * count, filter types per slot, frequency / Q / gain domains with steps and value sets, cross-band
 * rules and the preamp. Nothing here restates them. Graphic EQs need no mode either — a profile
 * whose every slot has a locked frequency is one (`isGraphicProfile`).
 *
 * Entries come from three places:
 *   - `builtin`: the unlimited default and a generic 10-band graphic EQ, baked into the binary.
 *   - `device`: the profile of the hardware the user connected, while it stays connected.
 *   - `catalog`: a profile the user picked from the eqcaps database (a software EQ, or hardware
 *     they want to plan an EQ for without plugging it in).
 */
export interface EqConstraintPreset {
	/** Unique id. `__device-peq__` for the connected device, `eqcaps:<id>` for catalog picks. */
	id: string;
	/** Human-readable label shown in the picker. */
	label: string;
	source: 'builtin' | 'device' | 'catalog';
	profile: Profile;
}
