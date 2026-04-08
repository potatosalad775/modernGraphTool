/**
 * Logarithmic scale utilities for slider ↔ value mapping.
 * Used by EQ filter sliders (frequency, Q factor) where linear sliders
 * don't distribute the range usefully.
 */

/**
 * Convert a value in a logarithmic range to a linear slider position.
 * @param value - The actual value (e.g. 1000 Hz)
 * @param min - Range minimum (e.g. 20 Hz)
 * @param max - Range maximum (e.g. 20000 Hz)
 * @param steps - Number of discrete slider steps (default 1000)
 * @returns Integer slider position from 0 to steps
 */
export function logToLinear(value: number, min: number, max: number, steps = 1000): number {
	const logMin = Math.log10(min);
	const logMax = Math.log10(max);
	return Math.round(((Math.log10(value) - logMin) / (logMax - logMin)) * steps);
}

/**
 * Convert a linear slider position back to a value in a logarithmic range.
 * @param position - Slider position (0 to steps)
 * @param min - Range minimum (e.g. 20 Hz)
 * @param max - Range maximum (e.g. 20000 Hz)
 * @param steps - Number of discrete slider steps (default 1000)
 * @returns The actual value in the log range
 */
export function linearToLog(position: number, min: number, max: number, steps = 1000): number {
	const logMin = Math.log10(min);
	const logMax = Math.log10(max);
	return Math.pow(10, logMin + (position / steps) * (logMax - logMin));
}

/** Format frequency for display: "200", "1.0k", "10k", "20k" */
export function formatFreq(hz: number | null): string {
	if (hz == null) return '--';
	if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`;
	if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
	return `${Math.round(hz)}`;
}

/** Format gain with sign: "+3.0", "-1.5", "0.0" */
export function formatGain(db: number | null): string {
	if (db == null) return '--';
	const sign = db > 0 ? '+' : '';
	return `${sign}${db.toFixed(1)}`;
}

/** Format Q factor: "0.71", "1.41" */
export function formatQ(q: number | null): string {
	if (q == null) return '--';
	return q.toFixed(2);
}
