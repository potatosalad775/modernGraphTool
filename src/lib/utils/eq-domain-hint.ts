import type { Domain } from '@potatosalad775/eqcaps-core';
import * as m from '$lib/paraglide/messages.js';

/**
 * A domain as a short, localized hint: "20 – 20000 Hz", "-12 – 12 dB, step 0.5",
 * "31, 62, 125 … 16000 Hz (10 values)", "1.41".
 *
 * eqcaps core has `describeDomain` for this, but its text is English; everything here is numbers
 * plus the two words that need translating.
 */
export function domainHint(d: Domain, unit: string): string {
	const u = unit ? ` ${unit}` : '';
	if ('value' in d) return `${fmt(d.value)}${u}`;
	if ('values' in d) {
		const v = d.values;
		const shown =
			v.length > 6 ? [...v.slice(0, 3).map(fmt), '…', fmt(v[v.length - 1])] : v.map(fmt);
		return `${shown.join(', ')}${u} (${m.eq_domain_values({ count: v.length })})`;
	}
	const range = `${fmt(d.min)} – ${fmt(d.max)}${u}`;
	return 'step' in d ? `${range}, ${m.eq_domain_step({ step: fmt(d.step) })}` : range;
}

/** Up to four decimals, without trailing zeros. */
function fmt(x: number): string {
	return String(Math.round(x * 10000) / 10000);
}
