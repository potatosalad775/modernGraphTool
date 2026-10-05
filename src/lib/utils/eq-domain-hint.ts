import type { Domain, Profile } from '@potatosalad775/eqcaps-core';
import * as m from '$lib/paraglide/messages.js';
import { envelopeOf } from './eq-constraint.js';

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

/**
 * "10 bands · -12 to +12 dB": what a profile allows, at a glance. Just the bands when no slot gives
 * gain a finite range, rather than "10 bands ·  to  dB".
 */
export function limitsSummaryOf(profile: Profile): string {
	const bands = profile.bandCount ?? '∞';
	const gain = envelopeOf(profile, 'gain');
	if (!gain || !Number.isFinite(gain.min) || !Number.isFinite(gain.max)) {
		return m.equalizer_device_peq_limits_bands({ bands });
	}
	return m.equalizer_device_peq_limits({ bands, min: fmt(gain.min), max: signed(gain.max) });
}

/** A gain with its sign spelled out, so a boost reads as one: "+12", "0", "-3". */
function signed(x: number): string {
	return x > 0 ? `+${fmt(x)}` : fmt(x);
}

/** Up to four decimals, without trailing zeros. */
function fmt(x: number): string {
	return String(Math.round(x * 10000) / 10000);
}
