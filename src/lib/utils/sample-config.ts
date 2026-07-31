/**
 * Config resolution for sample sets.
 *
 * `SAMPLES` replaced the old `MULTI_SAMPLE` and `HPTF` sections. Both legacy
 * sections are still read here and mapped onto the new tokens, so a `config.js`
 * written before the two concepts were unified keeps behaving identically —
 * operators host these files themselves and are never forced to migrate.
 */
import type { SampleDisplayMode } from '$lib/types/data-types.js';
import { getConfigValue } from './config.js';

const VALID_MODES: SampleDisplayMode[] = ['avg', 'curves', 'fill'];

/** Keep only recognized tokens, in a stable order, without duplicates. */
export function normalizeDisplayModes(input: unknown): SampleDisplayMode[] | null {
	if (!Array.isArray(input)) return null;
	const out = VALID_MODES.filter((mode) => input.includes(mode));
	return out;
}

/**
 * Site-wide default display set.
 *
 * `SAMPLES.DEFAULT_DISPLAY` wins. Failing that, `MULTI_SAMPLE.DEFAULT_DISPLAY`
 * maps `'all'` → averaged line plus per-run curves and `'average'` → the
 * averaged line alone, which is what those two values meant.
 */
export function defaultSampleDisplay(): SampleDisplayMode[] {
	const configured = normalizeDisplayModes(getConfigValue('SAMPLES.DEFAULT_DISPLAY'));
	if (configured) return configured;

	const legacy = getConfigValue('MULTI_SAMPLE.DEFAULT_DISPLAY') as string | undefined;
	if (legacy === 'all') return ['avg', 'curves'];
	return ['avg'];
}

/** Site-wide default run count for variants that declare no sample set. */
export function defaultSampleCount(): number {
	const configured = getConfigValue('SAMPLES.DEFAULT_COUNT');
	const n = typeof configured === 'number' ? configured : parseInt(String(configured ?? ''), 10);
	return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Opacity of the deviation fill area. `HPTF.FILL_OPACITY` is the legacy source. */
export function sampleFillOpacity(): number {
	const configured = getConfigValue('SAMPLES.FILL_OPACITY') ?? getConfigValue('HPTF.FILL_OPACITY');
	const n = typeof configured === 'number' ? configured : parseFloat(String(configured ?? ''));
	return Number.isFinite(n) ? n : 0.3;
}

/**
 * Display set for a legacy `hptfs[]` entry, derived from `HPTF.DEFAULT_DISPLAY`
 * and the entry's own `fillOnly` flag.
 *
 * The old fields map one-to-one: `hptfAvgVisible` was `DEFAULT_DISPLAY !== 'none'`,
 * `hptfFillVisible` was `'fill' | 'fill+curves'`, and per-sample curves were only
 * offered when `fillOnly` was false.
 */
export function legacyHptfDisplay(fillOnly: boolean): SampleDisplayMode[] {
	const mode = (getConfigValue('HPTF.DEFAULT_DISPLAY') as string) ?? 'fill+curves';
	const modes: SampleDisplayMode[] = [];
	if (mode !== 'none') modes.push('avg');
	if (!fillOnly && (mode === 'curves' || mode === 'fill+curves')) modes.push('curves');
	if (mode === 'fill' || mode === 'fill+curves') modes.push('fill');
	return normalizeDisplayModes(modes)!;
}

/** Display set for a legacy phone-level `samples: N` declaration. */
export function legacyMultiSampleDisplay(): SampleDisplayMode[] {
	const legacy = getConfigValue('MULTI_SAMPLE.DEFAULT_DISPLAY') as string | undefined;
	return legacy === 'all' ? ['avg', 'curves'] : ['avg'];
}
