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
 *
 * `sampleLabel` names an individual run of a sample set, and reads ahead of the
 * channel — "HD 600 Leather Pad (Center, R)". Without it, every run of a set
 * rendered as the same string, so the graph could not say which measurement a
 * curve was.
 */
export function curveDisplayName(obj: FRDataObject, channel: string, sampleLabel?: string): string {
	const base = curveBaseName(obj);
	if (obj.type === 'target') {
		return obj.adjustmentLabel ? `${base} ${obj.adjustmentLabel}` : base;
	}
	return sampleLabel ? `${base} (${sampleLabel}, ${channel})` : `${base} (${channel})`;
}

/**
 * Resolve a `sample{n}_{ch}` display key against an item's sample set.
 *
 * Returns the run's curator label when it has one and its channel, so callers
 * can hand both to `curveDisplayName`. A run with no label falls back to a
 * 1-based ordinal — keys are 0-based internally, but "Sample 1" is what the
 * operator numbered the file.
 */
export function sampleKeyParts(
	obj: FRDataObject,
	key: string
): { label: string; channel: 'L' | 'R' | 'AVG'; index: number } | null {
	const match = key.match(/^sample(\d+)_(L|R|AVG)$/);
	if (!match) return null;
	const index = parseInt(match[1]);
	const channel = match[2] as 'L' | 'R' | 'AVG';
	const label = obj.samples?.[index]?.label ?? `Sample ${index + 1}`;
	return { label, channel, index };
}
