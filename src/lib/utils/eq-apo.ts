import type { EQFilter } from './equalizer.js';
import type { EqChannel } from './eq-channel.js';
import { hasPerChannelFilters } from './eq-channel.js';

/**
 * Equalizer APO parametric-config text — parse and emit.
 *
 * The dialect AutoEq, Squiglink tools and Equalizer APO itself all speak:
 *
 * ```
 * Preamp: -6.3 dB
 * Filter 1: ON PK Fc 105 Hz Gain -3.2 dB Q 1.410
 * Channel: L
 * Filter 2: ON LSC Fc 105 Hz Gain 2.0 dB Q 0.700
 * ```
 *
 * `Channel:` scopes every following `Filter` line until the next `Channel:`.
 * We only model the three cases a headphone EQ needs — both ears, left, right —
 * and treat anything else as both, since a config written for a surround layout
 * still describes filters a user meant to hear.
 *
 * Lives here rather than inside `EqFilterList.svelte` so it is testable: this is
 * the one place in the EQ path where a user's file meets our data model, and it
 * had no coverage at all while it sat in the component.
 */

/** Internal names differ from APO's shelf spelling. */
const TYPE_FROM_APO: Record<string, EQFilter['type']> = {
	PK: 'PK',
	PEQ: 'PK',
	LSC: 'LSQ',
	LS: 'LSQ',
	LSQ: 'LSQ',
	HSC: 'HSQ',
	HS: 'HSQ',
	HSQ: 'HSQ'
};

function apoTypeName(type: EQFilter['type']): string {
	if (type === 'LSQ') return 'LSC';
	if (type === 'HSQ') return 'HSC';
	return 'PK';
}

/**
 * Read a `Channel:` directive. `ALL`, an empty list, or naming both ears all
 * mean shared; a lone `L` or `R` pins the section to that ear. Anything we
 * don't recognise falls back to shared rather than silently dropping the
 * filters that follow it.
 */
function parseChannelDirective(value: string): EqChannel | undefined {
	const tokens = value
		.trim()
		.toUpperCase()
		.split(/[\s,]+/)
		.filter(Boolean);
	if (tokens.length === 0) return undefined;
	if (tokens.includes('ALL')) return undefined;
	const hasL = tokens.includes('L');
	const hasR = tokens.includes('R');
	if (hasL && !hasR) return 'L';
	if (hasR && !hasL) return 'R';
	return undefined;
}

// `Fc` is matched as a decimal: APO writes integers but AutoEq and several
// vendor exports write `Fc 105.5 Hz`, and the old integer-only pattern made the
// whole line fail to match rather than rounding.
const FILTER_LINE =
	/^\s*Filter\s+\d+\s*:\s*(ON|OFF)?\s*([A-Za-z]+)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+([+-]?[\d.]+)\s*dB\s+Q\s+([+-]?[\d.]+)/i;

/**
 * Parse an Equalizer APO parametric config into filters.
 *
 * Unparseable lines are skipped, so a config carrying `Convolution:`,
 * `Include:` or comments still yields its filters. `Preamp:` is deliberately
 * ignored — ours is derived from the filter set, so honouring an imported one
 * would be overwritten on the next render anyway.
 */
export function parseApoFilters(text: string): EQFilter[] {
	const filters: EQFilter[] = [];
	let channel: EqChannel | undefined = undefined;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const channelMatch = line.match(/^Channel\s*:\s*(.*)$/i);
		if (channelMatch) {
			channel = parseChannelDirective(channelMatch[1]);
			continue;
		}

		const match = line.match(FILTER_LINE);
		if (!match) continue;
		const [, onOff, rawType, freq, gain, q] = match;
		const type = TYPE_FROM_APO[rawType.toUpperCase()];
		// An unknown filter type (APO has BP, NO, AP, …) has no representation
		// here; skipping beats importing it as a peak that reshapes the curve.
		if (!type) continue;

		filters.push({
			// APO's `OFF` is a real state users rely on to park a band. The old
			// parser ignored the token and imported everything enabled.
			enabled: onOff?.toUpperCase() !== 'OFF',
			type,
			freq: parseFloat(freq),
			gain: parseFloat(gain),
			q: parseFloat(q),
			...(channel ? { channel } : {})
		});
	}

	return filters;
}

/**
 * Emit an Equalizer APO parametric config.
 *
 * Bands are grouped into shared / left / right sections. **With no per-channel
 * bands, no `Channel:` line is written at all** — an ordinary EQ exports exactly
 * as it did before per-channel EQ existed, so operators diffing exports or
 * feeding them to other software see no change.
 *
 * The one deliberate difference from the old exporter: a disabled band is now
 * written `OFF` instead of `ON`. Exporting a band the user had switched off as
 * an active filter was a bug — the file did not describe the EQ on screen — and
 * it is what lets a config round-trip through `parseApoFilters` intact.
 *
 * `Filter N:` is numbered sequentially across the whole file. APO scopes a
 * filter's index to its channel, so restarting per section would be legal, but
 * one global sequence can never collide and reads the way hand-written configs
 * do.
 */
export function formatApoFilters(filters: EQFilter[], preamp: number): string {
	const valid = filters.filter((f) => f.freq != null && f.q != null && f.gain != null);

	const sections: { directive: string | null; bands: EQFilter[] }[] = hasPerChannelFilters(valid)
		? [
				{ directive: 'ALL', bands: valid.filter((f) => f.channel == null) },
				{ directive: 'L', bands: valid.filter((f) => f.channel === 'L') },
				{ directive: 'R', bands: valid.filter((f) => f.channel === 'R') }
			]
		: [{ directive: null, bands: valid }];

	let text = `Preamp: ${preamp.toFixed(1)} dB\n`;
	let n = 0;
	for (const section of sections) {
		if (!section.bands.length) continue;
		if (section.directive) text += `Channel: ${section.directive}\n`;
		for (const f of section.bands) {
			n++;
			text +=
				`Filter ${n}: ${f.enabled ? 'ON' : 'OFF'} ${apoTypeName(f.type)} ` +
				`Fc ${f.freq!.toFixed(0)} Hz Gain ${f.gain!.toFixed(1)} dB Q ${f.q!.toFixed(3)}\n`;
		}
	}
	return text;
}
