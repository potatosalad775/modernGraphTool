import type { FRDataObject } from '#lib/types/data-types.js';

/**
 * `identifier` plus its variant suffix — "HD600 Stock".
 *
 * The one composer of identifier + suffix: `shareKey`, the EQ source picker's label and
 * download file names all build on it.
 *
 * The suffix is appended conditionally rather than interpolated: `dispSuffix`
 * is an empty string for any device with no variants (and `null`/`undefined`
 * on a few `updateFRData` paths), so interpolating it unconditionally leaves a
 * trailing space, a double space before the channel tag, or a literal
 * "undefined" in the label.
 */
export function curveBaseName(obj: Pick<FRDataObject, 'identifier' | 'dispSuffix'>): string {
	return obj.dispSuffix ? `${obj.identifier} ${obj.dispSuffix}` : obj.identifier;
}
