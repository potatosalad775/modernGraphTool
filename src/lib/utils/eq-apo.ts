import { usesGain, type EQFilter } from './equalizer.js';
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
	HSQ: 'HSQ',
	LPQ: 'LPQ',
	HPQ: 'HPQ',
	BP: 'BP',
	NO: 'NO',
	AP: 'AP'
};

function apoTypeName(type: EQFilter['type']): string {
	if (type === 'LSQ') return 'LSC';
	if (type === 'HSQ') return 'HSC';
	return type;
}

/**
 * Read a `Channel:` directive. `ALL`, an empty list, or naming both ears all
 * mean shared; a lone `L` or `R` pins the section to that ear. APO also takes
 * positions by number, counted from 1 in the device's layout — on the stereo
 * output a headphone EQ targets that is `1` = L, `2` = R. Anything we don't
 * recognise falls back to shared rather than silently dropping the filters
 * that follow it.
 */
function parseChannelDirective(value: string): EqChannel | undefined {
	const tokens = value
		.trim()
		.toUpperCase()
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((t) => (t === '1' ? 'L' : t === '2' ? 'R' : t));
	if (tokens.length === 0) return undefined;
	if (tokens.includes('ALL')) return undefined;
	const hasL = tokens.includes('L');
	const hasR = tokens.includes('R');
	if (hasL && !hasR) return 'L';
	if (hasR && !hasL) return 'R';
	return undefined;
}

/**
 * The sample rate the bandwidth conversion assumes. APO's `BW Oct` is RBJ's
 * digital bandwidth, so the equivalent Q depends on the rate; 48 kHz is what
 * our own filter math runs at (`Equalizer.config.DefaultSampleRate`).
 */
const BW_SAMPLE_RATE = 48000;

/** A `Filter` command, numbered or not — APO does not interpret the number. */
const FILTER_COMMAND = /^Filter\s*\d*\s*:\s*(.*)$/i;
// `Fc` is matched as a decimal: APO writes integers but AutoEq and several
// vendor exports write `Fc 105.5 Hz`.
const FC = /\bFc\s+(\d+(?:\.\d+)?)/i;
const GAIN = /\bGain\s+([+-]?\d+(?:\.\d+)?)/i;
const Q = /\bQ\s+(\d+(?:\.\d+)?)/i;
const BW_OCT = /\bBW\s+Oct\s+(\d+(?:\.\d+)?)/i;
/** `LSC 12 dB Fc …` — a shelf slope in dB per octave, written before `Fc`. */
const SHELF_SLOPE = /^(\d+(?:\.\d+)?)\s*dB\b/i;
/** `LS 6dB` / `HS 12dB` — corner-frequency shelves, a different filter. */
const CORNER_SHELF = /^\d+dB\b/i;

/** Q for a bandwidth in octaves, as APO computes it: RBJ's digital form, `w0 / sin(w0)` included. */
function qFromBandwidth(bw: number, freq: number): number {
	const w0 = (2 * Math.PI * freq) / BW_SAMPLE_RATE;
	return 1 / (2 * Math.sinh(((Math.LN2 / 2) * bw * w0) / Math.sin(w0)));
}

/**
 * Q for an RBJ shelf slope S, where APO's `x dB` per octave is `S = x / 12`.
 * NaN when the slope is too steep for the gain — RBJ's S has an upper bound.
 */
function qFromShelfSlope(slopeDb: number, gain: number): number {
	const a = Math.pow(10, gain / 40);
	const s = slopeDb / 12;
	return 1 / Math.sqrt((a + 1 / a) * (1 / s - 1) + 2);
}

/** Three decimals, what the exporter writes — a converted Q needn't carry float noise. */
const roundQ = (q: number) => Math.round(q * 1000) / 1000;

/**
 * Read the body of one `Filter` command into a band, or null when it describes
 * something we cannot represent. Bandwidth and shelf slope convert to Q
 * exactly, since our filters are the same RBJ biquads APO builds; a shelf with
 * neither gets APO's default of 12 dB/oct (S = 1, Q = 1/√2).
 */
function parseFilterBody(body: string): Omit<EQFilter, 'channel'> | null {
	const head = body
		.replace(/#.*$/, '')
		.trim()
		.match(/^(?:(ON|OFF)\s+)?([A-Za-z]+)\s*(.*)$/i);
	if (!head) return null;
	const [, onOff, rawType, params] = head;
	const type = TYPE_FROM_APO[rawType.toUpperCase()];
	// An unknown filter type (APO's fixed-Q `LP`, `HP`, …) has no representation
	// here; skipping beats importing it as a peak that reshapes the curve.
	// So does a corner-frequency shelf: it is not the RBJ shelf we model.
	if (!type || CORNER_SHELF.test(params)) return null;

	// The gainless types (`LPQ`, `HPQ`, `BP`, `NO`, `AP`) are written without a `Gain`.
	const fc = params.match(FC);
	const gainMatch = params.match(GAIN);
	if (!fc || (!gainMatch && usesGain(type))) return null;
	const freq = parseFloat(fc[1]);
	const gain = gainMatch && usesGain(type) ? parseFloat(gainMatch[1]) : 0;

	const qMatch = params.match(Q);
	const bwMatch = params.match(BW_OCT);
	const shelf = type === 'LSQ' || type === 'HSQ';
	const slopeMatch = shelf ? params.match(SHELF_SLOPE) : null;
	let q: number;
	if (qMatch) q = parseFloat(qMatch[1]);
	else if (bwMatch) q = roundQ(qFromBandwidth(parseFloat(bwMatch[1]), freq));
	else if (slopeMatch) q = roundQ(qFromShelfSlope(parseFloat(slopeMatch[1]), gain));
	else if (shelf) q = roundQ(Math.SQRT1_2);
	else return null;
	if (!(freq > 0) || !(q > 0) || !Number.isFinite(q)) return null;

	return {
		// APO's `OFF` is a real state users rely on to park a band.
		enabled: onOff?.toUpperCase() !== 'OFF',
		type,
		freq,
		gain,
		q
	};
}

/**
 * Parse an Equalizer APO parametric config into filters, counting the
 * `Filter` lines that could not be imported so the caller can say so.
 *
 * Other lines are skipped without counting, so a config carrying
 * `Convolution:`, `Include:` or comments still yields its filters. `Preamp:`
 * is deliberately ignored — ours is derived from the filter set, so honouring
 * an imported one would be overwritten on the next render anyway.
 */
export function parseApoConfig(text: string): { filters: EQFilter[]; skipped: number } {
	const filters: EQFilter[] = [];
	let skipped = 0;
	let channel: EqChannel | undefined = undefined;

	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const channelMatch = line.match(/^Channel\s*:\s*([^#]*)/i);
		if (channelMatch) {
			channel = parseChannelDirective(channelMatch[1]);
			continue;
		}

		const command = line.match(FILTER_COMMAND);
		if (!command) continue;
		const band = parseFilterBody(command[1]);
		if (!band) {
			skipped++;
			continue;
		}
		filters.push({ ...band, ...(channel ? { channel } : {}) });
	}

	return { filters, skipped };
}

/** {@link parseApoConfig} without the skip count. */
export function parseApoFilters(text: string): EQFilter[] {
	return parseApoConfig(text).filters;
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
				`Fc ${f.freq!.toFixed(0)} Hz ` +
				(usesGain(f.type) ? `Gain ${f.gain!.toFixed(1)} dB ` : '') +
				`Q ${f.q!.toFixed(3)}\n`;
		}
	}
	return text;
}
