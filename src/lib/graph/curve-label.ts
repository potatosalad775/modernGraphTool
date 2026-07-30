import type { FRDataObject } from '$lib/types/data-types.js';

/**
 * How a curve is named on screen.
 *
 * Two places render the same names — the on-graph labels in `GraphContainer`
 * and the inspection readout in `GraphInspection` — and they had drifted: the
 * inspection list showed a bare `identifier`, dropping the variant suffix and
 * the target-adjustment summary, so two variants of the same headphone were
 * indistinguishable while hovering. Both go through here now.
 */

/**
 * `identifier` plus its variant suffix — "HD600 Stock".
 *
 * The suffix is appended conditionally rather than interpolated: `dispSuffix`
 * is an empty string for any device with no variants (and `null`/`undefined`
 * on a few `updateFRData` paths), so interpolating it unconditionally leaves a
 * trailing space, a double space before the channel tag, or a literal
 * "undefined" in the label.
 */
export function curveBaseName(obj: FRDataObject): string {
	return obj.dispSuffix ? `${obj.identifier} ${obj.dispSuffix}` : obj.identifier;
}

/**
 * The name for one curve row: base name, plus the TargetCustomizer adjustment
 * summary on targets and the channel tag on everything else. Targets carry no
 * channel tag because they are always a single AVG curve.
 */
export function curveDisplayName(obj: FRDataObject, channel: string): string {
	const base = curveBaseName(obj);
	if (obj.type === 'target') {
		return obj.adjustmentLabel ? `${base} ${obj.adjustmentLabel}` : base;
	}
	return `${base} (${channel})`;
}
