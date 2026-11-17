/**
 * Reads a committed `<input type="number">` value as a number held within `[min, max]`.
 *
 * Returns `null` when the text is not a finite number (an emptied box, a lone `-`), so the caller
 * can keep the stored value instead of writing `NaN` — which `??` does not catch. `integer` rounds
 * before clamping. When the range is inverted (`min > max`) the upper bound wins.
 */
export function parseBounded(
	raw: string,
	min: number,
	max: number,
	integer = false
): number | null {
	if (raw.trim() === '') return null;
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return Math.min(max, Math.max(min, integer ? Math.round(n) : n));
}
