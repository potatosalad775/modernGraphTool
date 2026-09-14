/**
 * Ranking data — config resolution, sheet-row matching and rank rendering.
 *
 * Pure logic only; the fetching singleton is `ranking-service.svelte.ts`.
 *
 * Two features share this file, and only the first one is common:
 *
 * 1. **A link out.** `RANKING.URL` (or the deprecated flat `RANKING_URL`) turns
 *    the rank already in `phone_book.json` into a link to wherever the operator
 *    keeps their rankings. No sheet, no fetch, no squigRanking.
 * 2. **Ranks read from a published CSV**, opt-in via `RANKING.CONFIG_URL` (a
 *    squigRanking config) or `RANKING.SOURCE` (any CSV). Only then does
 *    anything here touch the network.
 *
 * With neither configured every function below no-ops and the device list
 * renders exactly what it rendered before ranking existed.
 */

import { getConfigValue } from '$lib/utils/config.js';
import { getLocale } from '$lib/paraglide/runtime.js';
import type { CsvRow } from '$lib/utils/csv.js';
import type { RankScaleEntry, RankingSourceConfig } from '$lib/types/data-types.js';

/** Default sheet headers — the ones squigRanking's own templates ship with. */
const DEFAULT_RANK_COLUMN = 'Rank';
const DEFAULT_BRAND_COLUMN = 'Brand';
const DEFAULT_MODEL_COLUMN = 'Model';
/** Anchor squigRanking assigns a card when its config declares no `deepLink`. */
const DEFAULT_DEEPLINK_TEMPLATE = '{Brand}-{Model}';
const DEFAULT_CACHE_TTL_SECONDS = 900;
/**
 * `phone_book.json` records no per-device type, so a deploy that never sets
 * `RANKING.TYPE` keeps resolving `{type}` to the literal it always did.
 */
const DEFAULT_TYPE = 'earphone';

export interface RankingSettings {
	/** Link template for the rank indicator. Empty means display-only. */
	url: string;
	/** squigRanking `types` key this deploy measures. Also fills `{type}` in `url`. */
	type: string;
	/** squigRanking `ranking-config.js` to read the sheet and scale from. */
	configUrl: string;
	/** Inline sheet declaration, used only when `configUrl` is unset. */
	source: RankingSourceConfig | null;
	display: 'auto' | 'badge' | 'stars' | 'text';
	match: 'strict' | 'loose';
	cacheTtlMs: number;
}

/** A ranking sheet reduced to what matching and rendering need. */
export interface ResolvedRankSource {
	csvUrl: string;
	rankColumn: string;
	brandColumn: string;
	modelColumn: string;
	scale: RankScaleEntry[];
	rowFilter: { field: string; values: string[] } | null;
	deepLinkTemplate: string;
	slugify: 'lowercase-hyphen' | 'none';
}

/** A device's rank, as resolved from the sheet. */
export interface ResolvedRank {
	/** Rank cell, verbatim. */
	value: string;
	/** Brand and model **as written in the sheet**, not as written in the phone book. */
	brand: string;
	model: string;
	/**
	 * Anchor the ranking page gives this row.
	 *
	 * Built from the sheet's own cells, because the whole point of matching is
	 * that the two files spell devices differently — an anchor built from the
	 * phone book's spelling would deep-link to a card that does not exist and
	 * land the visitor on an unscrolled list.
	 */
	slug: string;
}

/** How a rank should be drawn. `color` absent means "use the neutral token pair". */
export interface RankDisplay {
	kind: 'badge' | 'stars' | 'text';
	/** What is drawn. */
	text: string;
	/** The rank as written, for the tooltip. */
	title: string;
	color?: string;
	textColor?: string;
}

// ── Config ──────────────────────────────────────────────────────────────────

/** Resolves `RANKING`, falling back to the deprecated flat `RANKING_URL`. */
export function getRankingSettings(): RankingSettings {
	const url = getConfigValue('RANKING.URL') as string | undefined;
	const legacyUrl = getConfigValue('RANKING_URL') as string | undefined;
	const display = getConfigValue('RANKING.DISPLAY') as RankingSettings['display'] | undefined;
	const match = getConfigValue('RANKING.MATCH') as RankingSettings['match'] | undefined;
	const ttl = getConfigValue('RANKING.CACHE_TTL') as number | undefined;
	const source = getConfigValue('RANKING.SOURCE') as RankingSourceConfig | undefined;
	const type = getConfigValue('RANKING.TYPE') as string | undefined;
	const configUrl = getConfigValue('RANKING.CONFIG_URL') as string | undefined;

	return {
		url: (url ?? legacyUrl ?? '').trim(),
		type: (type ?? DEFAULT_TYPE).trim(),
		configUrl: (configUrl ?? '').trim(),
		source: source && typeof source.CSV_URL === 'string' && source.CSV_URL.trim() ? source : null,
		display: display ?? 'auto',
		match: match === 'loose' ? 'loose' : 'strict',
		cacheTtlMs: (typeof ttl === 'number' && ttl >= 0 ? ttl : DEFAULT_CACHE_TTL_SECONDS) * 1000
	};
}

/** An `I18nString` in squigRanking's shape — `default` and `i18n` are both optional. */
function resolveRankingI18n(value: unknown, lang: string): string {
	if (typeof value === 'string') return value;
	if (typeof value !== 'object' || value === null) return '';
	const wrapper = value as { default?: unknown; i18n?: Record<string, unknown> };
	const localized = wrapper.i18n?.[lang];
	if (typeof localized === 'string') return localized;
	return typeof wrapper.default === 'string' ? wrapper.default : '';
}

/** An inline `RANKING.SOURCE` block, normalized. */
export function adaptInlineSource(source: RankingSourceConfig): ResolvedRankSource {
	const filter = source.ROW_FILTER;
	return {
		csvUrl: source.CSV_URL.trim(),
		rankColumn: source.RANK_COLUMN?.trim() || DEFAULT_RANK_COLUMN,
		brandColumn: source.BRAND_COLUMN?.trim() || DEFAULT_BRAND_COLUMN,
		modelColumn: source.MODEL_COLUMN?.trim() || DEFAULT_MODEL_COLUMN,
		scale: Array.isArray(source.SCALE) ? source.SCALE : [],
		rowFilter:
			filter && typeof filter.FIELD === 'string' && Array.isArray(filter.VALUES)
				? { field: filter.FIELD, values: filter.VALUES.map(String) }
				: null,
		deepLinkTemplate: DEFAULT_DEEPLINK_TEMPLATE,
		slugify: 'lowercase-hyphen'
	};
}

/** The subset of `window.RANKING_CONFIG` this tool reads. Everything is optional. */
interface RawRankingConfig {
	types?: Record<
		string,
		{
			source?: { url?: unknown };
			rowFilter?: { field?: unknown; values?: unknown };
		}
	>;
	columns?: Array<{ source?: unknown; role?: unknown; scale?: unknown }>;
	deepLink?: { template?: unknown; slugify?: unknown };
}

/**
 * Reads a squigRanking `ranking-config.js` down to what this tool needs.
 *
 * **Deliberately tolerant.** That file belongs to the ranking page, not to us:
 * an unknown `configVersion`, a renderer we have never heard of or a column
 * shape we do not use are all fine, and none of them warrant a console message
 * in front of a visitor who cannot act on it. Anything genuinely unusable
 * returns `null` and the device list falls back to `phone_book.json`.
 */
export function adaptSquigRankingConfig(raw: unknown, type: string): ResolvedRankSource | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const config = raw as RawRankingConfig;

	const types = config.types ?? {};
	const names = Object.keys(types);
	// A single-type config needs no `RANKING.TYPE`; a multi-type one does, or a
	// headphone deploy would happily show the earphone sheet's grades.
	const chosen = types[type] ?? (names.length === 1 ? types[names[0]] : undefined);
	if (!chosen) {
		if (names.length > 1) {
			console.warn(
				`[modernGraphTool] RANKING.TYPE "${type}" is not one of the ranking config's types ` +
					`(${names.join(', ')}) — ranks will fall back to phone_book.json.`
			);
		}
		return null;
	}

	const csvUrl = typeof chosen.source?.url === 'string' ? chosen.source.url.trim() : '';
	if (!csvUrl) return null;

	const columns = Array.isArray(config.columns) ? config.columns : [];
	const byRole = (role: string): { source?: unknown; scale?: unknown } | undefined =>
		columns.find((column) => column?.role === role);
	const headerOf = (role: string, fallback: string): string => {
		const value = byRole(role)?.source;
		return typeof value === 'string' && value.trim() ? value.trim() : fallback;
	};

	const rawScale = byRole('rank')?.scale;
	const scale = Array.isArray(rawScale)
		? rawScale.filter(
				(entry): entry is RankScaleEntry =>
					typeof entry === 'object' && entry !== null && typeof entry.value === 'string'
			)
		: [];

	const filter = chosen.rowFilter;

	return {
		csvUrl,
		rankColumn: headerOf('rank', DEFAULT_RANK_COLUMN),
		brandColumn: headerOf('brand', DEFAULT_BRAND_COLUMN),
		modelColumn: headerOf('model', DEFAULT_MODEL_COLUMN),
		scale,
		rowFilter:
			filter && typeof filter.field === 'string' && Array.isArray(filter.values)
				? { field: filter.field, values: filter.values.map(String) }
				: null,
		deepLinkTemplate:
			typeof config.deepLink?.template === 'string' && config.deepLink.template.trim()
				? config.deepLink.template
				: DEFAULT_DEEPLINK_TEMPLATE,
		slugify: config.deepLink?.slugify === 'none' ? 'none' : 'lowercase-hyphen'
	};
}

// ── Matching ────────────────────────────────────────────────────────────────

/** Lowercased, whitespace-collapsed. */
export function normalize(value: string | undefined | null): string {
	if (!value) return '';
	return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Alphanumerics only. Survives punctuation and spacing differences between the two files. */
export function simplify(value: string | undefined | null): string {
	return String(value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

interface RankIndexEntry {
	row: CsvRow;
	brand: string;
	model: string;
	modelKey: string;
	modelSimple: string;
}

export interface RankIndex {
	source: ResolvedRankSource;
	match: 'strict' | 'loose';
	byBrand: Map<string, RankIndexEntry[]>;
	byBrandSimple: Map<string, RankIndexEntry[]>;
	/** Memoized lookups, misses included. Sized by the phone book, not the sheet. */
	cache: Map<string, ResolvedRank | null>;
}

function push(map: Map<string, RankIndexEntry[]>, key: string, entry: RankIndexEntry): void {
	if (!key) return;
	const bucket = map.get(key);
	if (bucket) bucket.push(entry);
	else map.set(key, [entry]);
}

/**
 * Bucket the sheet by brand once, so a lookup scans one brand's models rather
 * than the whole sheet.
 *
 * squigRanking resolves one row at a time and can afford a flat scan; this
 * resolves every device the visitor opens against the same sheet, so the brand
 * bucket is what keeps a 300-row sheet against an 800-device phone book down to
 * a handful of comparisons per lookup.
 */
export function buildRankIndex(
	rows: CsvRow[],
	source: ResolvedRankSource,
	match: 'strict' | 'loose'
): RankIndex {
	const index: RankIndex = {
		source,
		match,
		byBrand: new Map(),
		byBrandSimple: new Map(),
		cache: new Map()
	};

	const filter = source.rowFilter;
	const allowed = filter ? new Set(filter.values.map((value) => normalize(value))) : null;

	for (const row of rows) {
		if (filter && allowed && !allowed.has(normalize(row[filter.field]))) continue;
		// An unranked row must not shadow the phone book — treat it as absent.
		const value = (row[source.rankColumn] ?? '').trim();
		if (!value) continue;

		const brand = (row[source.brandColumn] ?? '').trim();
		const model = (row[source.modelColumn] ?? '').trim();
		if (!brand || !model) continue;

		const entry: RankIndexEntry = {
			row,
			brand,
			model,
			modelKey: normalize(model),
			modelSimple: simplify(model)
		};
		push(index.byBrand, normalize(brand), entry);
		push(index.byBrandSimple, simplify(brand), entry);
	}

	return index;
}

/** Anchor the ranking page assigns this row. Mirrors squigRanking's `buildCardId`. */
export function buildCardSlug(row: CsvRow, source: ResolvedRankSource): string {
	return source.deepLinkTemplate.replace(/\{([^}]+)\}/g, (_, key: string) => {
		const value = row[key] ?? '';
		return source.slugify === 'lowercase-hyphen' ? value.toLowerCase().replace(/\s+/g, '-') : value;
	});
}

function findLoose(entries: RankIndexEntry[], key: string, simple: string): RankIndexEntry | null {
	for (const entry of entries) {
		const name = entry.modelKey;
		if (name !== '' && (name.includes(key) || key.includes(name))) return entry;
	}
	if (!simple) return null;
	for (const entry of entries) {
		const name = entry.modelSimple;
		if (name !== '' && (name.includes(simple) || simple.includes(name))) return entry;
	}
	return null;
}

/**
 * Resolve one device to its sheet row, or `null`.
 *
 * Strict by default, and deliberately stricter than the ranking page's own
 * matcher. squigRanking can afford loose substring matching because a wrong
 * measurement link is obvious the moment it is clicked; a wrong *grade* is
 * silently wrong — it puts a B+ on a device nobody reviewed, and nothing about
 * the row says so. Showing no badge is the better failure.
 */
export function lookupRank(
	index: RankIndex | null,
	brand: string,
	model: string
): ResolvedRank | null {
	if (!index) return null;
	const brandKey = normalize(brand);
	const modelKey = normalize(model);
	if (!brandKey || !modelKey) return null;

	const cacheKey = `${brandKey} ${modelKey}`;
	const cached = index.cache.get(cacheKey);
	if (cached !== undefined) return cached;

	const brandSimple = simplify(brand);
	const modelSimple = simplify(model);

	let entries = index.byBrand.get(brandKey) ?? index.byBrandSimple.get(brandSimple) ?? null;
	if (!entries && index.match === 'loose') {
		for (const [key, bucket] of index.byBrand) {
			if (key !== '' && (key.includes(brandKey) || brandKey.includes(key))) {
				entries = bucket;
				break;
			}
		}
	}

	let hit: RankIndexEntry | null = null;
	if (entries) {
		hit =
			entries.find((entry) => entry.modelKey === modelKey) ??
			entries.find((entry) => modelSimple !== '' && entry.modelSimple === modelSimple) ??
			null;
		if (!hit && index.match === 'loose') hit = findLoose(entries, modelKey, modelSimple);
	}

	const resolved: ResolvedRank | null = hit
		? {
				value: (hit.row[index.source.rankColumn] ?? '').trim(),
				brand: hit.brand,
				model: hit.model,
				slug: buildCardSlug(hit.row, index.source)
			}
		: null;
	index.cache.set(cacheKey, resolved);
	return resolved;
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Whether a cell is a bare number, and so can be drawn as stars. */
function asNumber(value: string): number | null {
	if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Black or white, whichever contrasts better with a hex badge color.
 *
 * squigRanking documents white as the default, which is wrong on the lighter
 * half of a rank scale — several of its own presets run through yellow and
 * amber — and this tool targets WCAG AAA. A non-hex color can't be measured
 * here, so it keeps that documented default.
 */
export function readableTextColor(color: string | undefined): string | undefined {
	if (!color) return undefined;
	const hex = color.trim().replace(/^#/, '');
	const full =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex;
	if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff';

	const channel = (start: number): number => {
		const srgb = Number.parseInt(full.slice(start, start + 2), 16) / 255;
		return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
	};
	const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
	// WCAG contrast is (L1 + 0.05) / (L2 + 0.05); compare black's against white's.
	return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

/** Today's star row: 0-5, halves included. */
export function renderStars(score: number): string {
	const clamped = Math.max(0, Math.min(5, score));
	const full = Math.floor(clamped);
	const half = clamped % 1 >= 0.5 ? 1 : 0;
	return '★'.repeat(full) + (half ? '⭐' : '') + '☆'.repeat(5 - full - half);
}

/**
 * Decide how one rank is drawn.
 *
 * `'auto'` is what keeps every pre-ranking deploy looking identical: with no
 * scale configured a 0-5 number still renders as the star row it always did,
 * and anything else still renders as its own text.
 */
export function resolveRankDisplay(
	value: number | string | undefined | null,
	scale: RankScaleEntry[],
	mode: RankingSettings['display'] = 'auto'
): RankDisplay | null {
	const raw = String(value ?? '').trim();
	if (!raw) return null;

	const lang = getLocale();
	const key = raw.replace(/\s+/g, '').toUpperCase();
	const entry = scale.find((step) => String(step.value).replace(/\s+/g, '').toUpperCase() === key);
	const label = (entry && resolveRankingI18n(entry.label, lang)) || raw;
	const numeric = entry?.score ?? asNumber(raw);

	const asText = (): RankDisplay => ({ kind: 'text', text: label, title: label });
	const asStars = (): RankDisplay | null =>
		numeric === null ? null : { kind: 'stars', text: renderStars(numeric), title: label };
	const asBadge = (): RankDisplay => ({
		kind: 'badge',
		text: label,
		title: label,
		color: entry?.color,
		textColor: entry?.textColor ?? readableTextColor(entry?.color)
	});

	if (mode === 'text') return asText();
	if (mode === 'stars') return asStars() ?? asText();
	if (mode === 'badge') return asBadge();

	if (entry) return asBadge();
	// Nothing in the scale describes this value: legacy behavior, unchanged.
	if (numeric !== null && numeric >= 0 && numeric <= 5) return asStars();
	return asText();
}
