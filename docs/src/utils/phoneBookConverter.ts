/**
 * phoneBookConverter — parse and serialize phone_book.json for the GUI editor.
 *
 * Matches the actual parser in src/lib/utils/metadata-parser.ts:
 *  - brand key is `name` (not `brand`)
 *  - phone-level `description` (not `notes`)
 *  - sample sets are declared per variant inside `variants[]`
 *
 * Import is permissive: it accepts `brand` as the brand key (legacy docs), and
 * the two pre-unification sample forms — phone-level `samples: N` and `hptfs[]`.
 * Export is canonical: always writes `name`, and always `variants[]`.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type PhoneKind = 'simple' | 'detailed' | 'variations' | 'prefix' | 'sampleSet';

/** One entry of a phone's `links[]` — an operator-labelled extra link.
 *  A type alias rather than an interface so it satisfies `RowsEditor`'s
 *  `Record<string, string>` constraint (interfaces get no implicit index signature). */
export type PhoneLinkEntry = {
	label: string;
	url: string;
};

export interface SharedPhoneMeta {
	reviewScore?: string;
	reviewLink?: string;
	shopLink?: string;
	price?: string;
	description?: string;
	links?: PhoneLinkEntry[];
}

export interface BrandState {
	id: string;
	name: string;
	suffix?: string;
	phones: PhoneState[];
}

/** How a sample set is drawn. A set, not an enum — the three compose. */
export type SampleDisplayMode = 'avg' | 'curves' | 'fill';

/**
 * One entry of `variants[]`. A variant is either a plain L/R pair (`file` alone),
 * a numbered sample set (`file` + `count`), or an explicitly-named one (`rows`).
 */
export interface VariantEntry {
	/** Variant suffix shown in the device selector dropdown (e.g. "Leather Pad"). */
	suffix?: string;
	/** Base filename for the main L/R pair, and for the numbered run layout. */
	file: string;
	/** Numbered layout: `{file} L1.txt`…`L{count}.txt`. 0 means "no sample set". */
	count: number;
	/** Explicit layout: one row per run. Takes precedence over `count` when non-empty. */
	rows: Array<{ file: string; label: string }>;
	/** Run labels for the numbered (`count`) layout, where there are no rows. */
	labels: string[];
	display: SampleDisplayMode[];
	description?: string;
}

export interface PhoneState extends SharedPhoneMeta {
	id: string;
	kind: PhoneKind;
	simple?: { value: string };
	detailed?: { name: string; file: string; suffix?: string };
	variations?: { name: string; rows: Array<{ file: string; suffix: string }> };
	prefix?: { name: string; prefix: string; files: string[] };
	sampleSet?: {
		/** Device display name (shared across every variant). */
		name: string;
		/** One or more variants, each optionally carrying its own sample set. */
		variants: VariantEntry[];
	};
	/** Unknown keys from the raw JSON, preserved round-trip. */
	passthrough?: Record<string, unknown>;
}

export type PhoneBookState = BrandState[];

export interface ParseResult {
	state: PhoneBookState;
	warnings: string[];
}

// ── ID generation ───────────────────────────────────────────────────────────

let idCounter = 0;
export function makeId(prefix = 'id'): string {
	idCounter += 1;
	return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export function createEmptyPhone(kind: PhoneKind = 'detailed'): PhoneState {
	const base: PhoneState = { id: makeId('phone'), kind };
	switch (kind) {
		case 'simple':
			base.simple = { value: '' };
			break;
		case 'detailed':
			base.detailed = { name: '', file: '' };
			break;
		case 'variations':
			base.variations = {
				name: '',
				rows: [
					{ file: '', suffix: '' },
					{ file: '', suffix: '' }
				]
			};
			break;
		case 'prefix':
			base.prefix = { name: '', prefix: '', files: ['', ''] };
			break;
		case 'sampleSet':
			base.sampleSet = {
				name: '',
				variants: [{ suffix: '', file: '', count: 3, rows: [], labels: [], display: ['avg'] }]
			};
			break;
	}
	return base;
}

export function createEmptyBrand(): BrandState {
	return {
		id: makeId('brand'),
		name: '',
		phones: [createEmptyPhone('detailed')]
	};
}

export function createDefaultPhoneBook(): PhoneBookState {
	return [createEmptyBrand()];
}

// ── Kind-preserving type switch ─────────────────────────────────────────────

/** Switch a phone to a new kind while preserving shared metadata. */
export function switchPhoneKind(phone: PhoneState, newKind: PhoneKind): PhoneState {
	const fresh = createEmptyPhone(newKind);
	// Keep id and shared metadata
	fresh.id = phone.id;
	fresh.reviewScore = phone.reviewScore;
	fresh.reviewLink = phone.reviewLink;
	fresh.shopLink = phone.shopLink;
	fresh.price = phone.price;
	fresh.description = phone.description;
	fresh.links = phone.links;
	fresh.passthrough = phone.passthrough;

	// Best-effort field migration: carry over the base name where sensible
	const oldName = extractName(phone);
	if (oldName) {
		switch (newKind) {
			case 'detailed':
				fresh.detailed!.name = oldName;
				break;
			case 'variations':
				fresh.variations!.name = oldName;
				break;
			case 'prefix':
				fresh.prefix!.name = oldName;
				break;
			case 'sampleSet':
				fresh.sampleSet!.name = oldName;
				break;
			case 'simple':
				fresh.simple!.value = oldName;
				break;
		}
	}
	return fresh;
}

export function extractName(phone: PhoneState): string {
	switch (phone.kind) {
		case 'simple':
			return phone.simple?.value ?? '';
		case 'detailed':
			return phone.detailed?.name ?? '';
		case 'variations':
			return phone.variations?.name ?? '';
		case 'prefix':
			return phone.prefix?.name ?? '';
		case 'sampleSet':
			return phone.sampleSet?.name ?? '';
	}
}

// ── Parse: JSON text → PhoneBookState ───────────────────────────────────────

const KNOWN_PHONE_KEYS = new Set([
	'name',
	'file',
	'suffix',
	'prefix',
	'variants',
	'samples',
	'hptfs',
	'reviewScore',
	'reviewLink',
	'shopLink',
	'price',
	'description',
	'links'
]);

const KNOWN_BRAND_KEYS = new Set(['name', 'brand', 'suffix', 'phones']);

export function parsePhoneBook(jsonText: string): ParseResult {
	const warnings: string[] = [];
	let raw: unknown;
	try {
		raw = JSON.parse(jsonText);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`Invalid JSON: ${msg}`, { cause: e });
	}
	if (!Array.isArray(raw)) {
		throw new Error('phone_book.json must be a top-level array of brand objects.');
	}

	const brands: BrandState[] = raw.map((rawBrand, brandIdx) => {
		if (typeof rawBrand !== 'object' || rawBrand == null || Array.isArray(rawBrand)) {
			throw new Error(`Brand at index ${brandIdx} is not an object.`);
		}
		const b = rawBrand as Record<string, unknown>;
		const name =
			typeof b.name === 'string'
				? b.name
				: typeof b.brand === 'string'
					? (warnings.push(`Brand #${brandIdx}: legacy "brand" key converted to "name".`), b.brand)
					: '';
		if (!name) warnings.push(`Brand #${brandIdx}: missing or empty brand name.`);

		const suffix = typeof b.suffix === 'string' ? b.suffix : undefined;

		for (const key of Object.keys(b)) {
			if (!KNOWN_BRAND_KEYS.has(key)) {
				warnings.push(`Brand "${name || brandIdx}": unknown key "${key}" ignored.`);
			}
		}

		const rawPhones = Array.isArray(b.phones) ? b.phones : [];
		if (!Array.isArray(b.phones)) {
			warnings.push(`Brand "${name || brandIdx}": missing "phones" array.`);
		}

		const phones = rawPhones.map((p, phoneIdx) =>
			parsePhone(p, name || String(brandIdx), phoneIdx, warnings)
		);

		return { id: makeId('brand'), name, suffix, phones };
	});

	return { state: brands, warnings };
}

function parsePhone(
	raw: unknown,
	brandLabel: string,
	phoneIdx: number,
	warnings: string[]
): PhoneState {
	// Simple string entry
	if (typeof raw === 'string') {
		return { id: makeId('phone'), kind: 'simple', simple: { value: raw } };
	}
	if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
		warnings.push(
			`Brand "${brandLabel}" phone #${phoneIdx}: not a string or object, coerced to empty.`
		);
		return createEmptyPhone('detailed');
	}

	const p = raw as Record<string, unknown>;

	// Collect unknown keys for passthrough
	const passthrough: Record<string, unknown> = {};
	for (const key of Object.keys(p)) {
		if (!KNOWN_PHONE_KEYS.has(key)) {
			passthrough[key] = p[key];
			warnings.push(
				`Brand "${brandLabel}" phone #${phoneIdx}: unknown key "${key}" preserved on export.`
			);
		}
	}

	// Shared metadata (stringify numbers for reviewScore to match UI)
	const shared: SharedPhoneMeta = {};
	if (p.reviewScore != null) shared.reviewScore = String(p.reviewScore);
	if (typeof p.reviewLink === 'string') shared.reviewLink = p.reviewLink;
	if (typeof p.shopLink === 'string') shared.shopLink = p.shopLink;
	if (typeof p.price === 'string') shared.price = p.price;
	if (typeof p.description === 'string') shared.description = p.description;
	if (p.links != null) {
		if (!Array.isArray(p.links)) {
			warnings.push(`Brand "${brandLabel}" phone #${phoneIdx}: "links" is not an array, dropped.`);
		} else {
			// mGT skips malformed entries at load time rather than failing the phone,
			// so the editor keeps whatever is salvageable and reports the rest.
			const links: PhoneLinkEntry[] = [];
			p.links.forEach((entry, linkIdx) => {
				const e = entry as Record<string, unknown> | null;
				const label = typeof e?.label === 'string' ? e.label : '';
				const url = typeof e?.url === 'string' ? e.url : '';
				if (!label || !url) {
					warnings.push(
						`Brand "${brandLabel}" phone #${phoneIdx}: link #${linkIdx} needs a "label" and a "url", dropped.`
					);
					return;
				}
				links.push({ label, url });
			});
			if (links.length) shared.links = links;
		}
	}

	const withShared = (phone: PhoneState): PhoneState => ({
		...phone,
		...shared,
		passthrough: Object.keys(passthrough).length ? passthrough : undefined
	});

	const baseName = extractBaseName(p.name);

	// `variants[]` — the explicit form. Each entry is one variant, optionally
	// carrying its own sample set.
	if (Array.isArray(p.variants) && p.variants.length > 0) {
		// modernGraphTool composes these with `variants[]` rather than ignoring them,
		// but this editor has no phone kind that holds both, so all five are dropped
		// on export. Say so plainly — silently discarding them costs the operator
		// both the variants themselves and the entry's CrinGraph compatibility.
		const shadowed = (['file', 'suffix', 'prefix', 'samples', 'hptfs'] as const).filter(
			(key) => p[key] !== undefined
		);
		if (shadowed.length > 0) {
			const list = shadowed.map((key) => `"${key}"`).join('/');
			const plural = shadowed.length > 1;
			warnings.push(
				`Brand "${brandLabel}" phone "${baseName || phoneIdx}": the phone-level ${list} ${
					plural ? 'keys are' : 'key is'
				} loaded by modernGraphTool alongside "variants", but this editor cannot represent ${
					plural ? 'them' : 'it'
				} yet and will drop ${
					plural ? 'them' : 'it'
				} on export — removing those variants and this entry's CrinGraph compatibility. Edit this phone by hand instead.`
			);
		}
		const variants = p.variants.map((raw, entryIdx) =>
			parseVariant(
				raw,
				`${brandLabel}" phone "${baseName || phoneIdx}" variants[${entryIdx}]`,
				warnings
			)
		);
		return withShared({
			id: makeId('phone'),
			kind: 'sampleSet',
			sampleSet: { name: baseName, variants }
		});
	}

	// Legacy `hptfs[]` — one variance set per entry. Unlike the old editor, the
	// phone's own file/suffix variants survive: `variants[]` is a flat list, so
	// both can be represented at once.
	if (Array.isArray(p.hptfs) && p.hptfs.length > 0) {
		const fileVariants = fileSuffixPairs(p).map(({ file, suffix }): VariantEntry => ({
			suffix,
			file,
			count: typeof p.samples === 'number' ? p.samples : 0,
			rows: [],
			labels: [],
			display: ['avg']
		}));
		const hptfVariants: VariantEntry[] = p.hptfs.map((raw, entryIdx) => {
			if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
				warnings.push(
					`Brand "${brandLabel}" phone "${baseName || phoneIdx}": hptfs[${entryIdx}] is not an object, coerced to empty.`
				);
				return { file: '', count: 0, rows: [], labels: [], display: ['avg', 'fill'] };
			}
			const h = raw as Record<string, unknown>;
			const files = Array.isArray(h.files) ? h.files.map(String) : [];
			const labels = Array.isArray(h.labels) ? h.labels.map(String) : files;
			const fillOnly = typeof h.fillOnly === 'boolean' ? h.fillOnly : true;
			return {
				suffix: typeof h.suffix === 'string' ? h.suffix : undefined,
				file: '',
				count: 0,
				rows: files.map((file, i) => ({ file, label: labels[i] ?? file })),
				labels: [],
				// `fillOnly` meant "no per-run curve toggles", nothing more.
				display: (fillOnly ? ['avg', 'fill'] : ['avg', 'curves', 'fill']) as SampleDisplayMode[],
				description: typeof h.description === 'string' ? h.description : undefined
			};
		});
		return withShared({
			id: makeId('phone'),
			kind: 'sampleSet',
			sampleSet: { name: baseName, variants: [...fileVariants, ...hptfVariants] }
		});
	}

	// Legacy phone-level `samples: N` — the same run count on every file variant.
	if (typeof p.samples === 'number') {
		const variants = fileSuffixPairs(p).map(({ file, suffix }): VariantEntry => ({
			suffix,
			file,
			count: p.samples as number,
			rows: [],
			labels: [],
			display: ['avg']
		}));
		return withShared({
			id: makeId('phone'),
			kind: 'sampleSet',
			sampleSet: { name: baseName, variants: variants.length ? variants : [emptyVariant()] }
		});
	}

	// prefix → prefix variations
	if (p.prefix !== undefined) {
		const prefixStr = Array.isArray(p.prefix)
			? String(p.prefix[0] ?? '')
			: typeof p.prefix === 'string'
				? p.prefix
				: '';
		const files = Array.isArray(p.file)
			? p.file.map(String)
			: typeof p.file === 'string'
				? [p.file]
				: [];
		return withShared({
			id: makeId('phone'),
			kind: 'prefix',
			prefix: { name: baseName, prefix: prefixStr, files }
		});
	}

	// file as array → variations
	if (Array.isArray(p.file)) {
		const files = p.file.map(String);
		const suffixes = Array.isArray(p.suffix)
			? p.suffix.map(String)
			: typeof p.suffix === 'string'
				? [p.suffix]
				: [];
		const rows = files.map((file, i) => ({ file, suffix: suffixes[i] ?? '' }));
		return withShared({
			id: makeId('phone'),
			kind: 'variations',
			variations: { name: baseName, rows }
		});
	}

	// Otherwise → detailed
	return withShared({
		id: makeId('phone'),
		kind: 'detailed',
		detailed: {
			name: baseName,
			file: typeof p.file === 'string' ? p.file : '',
			suffix: typeof p.suffix === 'string' ? p.suffix : undefined
		}
	});
}

export function emptyVariant(): VariantEntry {
	return { suffix: '', file: '', count: 0, rows: [], labels: [], display: ['avg'] };
}

/** Zip the phone-level `file` / `suffix` keys into one pair per variant. */
function fileSuffixPairs(p: Record<string, unknown>): Array<{ file: string; suffix: string }> {
	const files = Array.isArray(p.file)
		? p.file.map(String)
		: typeof p.file === 'string'
			? [p.file]
			: [];
	const suffixes = Array.isArray(p.suffix)
		? p.suffix.map(String)
		: typeof p.suffix === 'string'
			? [p.suffix]
			: [];
	return files.map((file, i) => ({ file, suffix: suffixes[i] ?? '' }));
}

const VALID_MODES: SampleDisplayMode[] = ['avg', 'curves', 'fill'];

function parseVariant(raw: unknown, where: string, warnings: string[]): VariantEntry {
	if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
		warnings.push(`Brand "${where}: not an object, coerced to empty.`);
		return emptyVariant();
	}
	const v = raw as Record<string, unknown>;

	// A bare number is shorthand for `{ count: n }` — normalize at the boundary
	// so only one shape flows through the editor.
	const set: Record<string, unknown> =
		typeof v.samples === 'number'
			? { count: v.samples }
			: typeof v.samples === 'object' && v.samples != null && !Array.isArray(v.samples)
				? (v.samples as Record<string, unknown>)
				: {};

	const files = Array.isArray(set.files) ? set.files.map(String) : [];
	const labels = Array.isArray(set.labels) ? set.labels.map(String) : files;
	const display = Array.isArray(set.display)
		? VALID_MODES.filter((m) => (set.display as unknown[]).includes(m))
		: ['avg' as SampleDisplayMode];

	return {
		suffix: typeof v.suffix === 'string' ? v.suffix : '',
		file: typeof v.file === 'string' ? v.file : '',
		count: typeof set.count === 'number' ? set.count : 0,
		rows: files.map((file, i) => ({ file, label: labels[i] ?? file })),
		labels: files.length === 0 && Array.isArray(set.labels) ? set.labels.map(String) : [],
		display,
		description: typeof set.description === 'string' ? set.description : undefined
	};
}

/**
 * Emit one `variants[]` entry. A variant with no runs writes no `samples` key at
 * all, and one that only needs a count writes the number shorthand — the object
 * form appears only when labels, an explicit file list, a non-default display or
 * a description actually need saying.
 */
function serializeVariant(entry: VariantEntry): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (entry.suffix) out.suffix = entry.suffix;
	if (entry.file) out.file = entry.file;

	const hasRows = entry.rows.length > 0;
	const hasCount = !hasRows && entry.count > 0;
	if (!hasRows && !hasCount) return out;

	const rowsLabelled = entry.rows.some((r) => r.label && r.label !== r.file);
	const countLabelled = entry.labels.some((l) => l);
	const defaultDisplay = entry.display.length === 1 && entry.display[0] === 'avg';

	if (hasCount && defaultDisplay && !countLabelled && !entry.description) {
		out.samples = entry.count;
		return out;
	}

	const set: Record<string, unknown> = {};
	if (hasRows) {
		set.files = entry.rows.map((r) => r.file);
		if (rowsLabelled) set.labels = entry.rows.map((r) => r.label);
	} else {
		set.count = entry.count;
		if (countLabelled) set.labels = entry.labels;
	}
	if (!defaultDisplay) set.display = entry.display;
	if (entry.description) set.description = entry.description;
	out.samples = set;
	return out;
}

function extractBaseName(raw: unknown): string {
	if (typeof raw === 'string') return raw;
	if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') return raw[0];
	return '';
}

// ── Serialize: PhoneBookState → JSON text ───────────────────────────────────

export function serializePhoneBook(state: PhoneBookState): string {
	const out = state.map((brand) => {
		const obj: Record<string, unknown> = { name: brand.name };
		if (brand.suffix) obj.suffix = brand.suffix;
		obj.phones = brand.phones.map(serializePhone);
		return obj;
	});
	return JSON.stringify(out, null, 2);
}

function serializePhone(phone: PhoneState): unknown {
	if (phone.kind === 'simple') {
		return phone.simple?.value ?? '';
	}

	const obj: Record<string, unknown> = {};

	switch (phone.kind) {
		case 'detailed': {
			const d = phone.detailed!;
			obj.name = d.name;
			obj.file = d.file;
			if (d.suffix) obj.suffix = d.suffix;
			break;
		}
		case 'variations': {
			const v = phone.variations!;
			obj.name = [v.name];
			obj.file = v.rows.map((r) => r.file);
			obj.suffix = v.rows.map((r) => r.suffix);
			break;
		}
		case 'prefix': {
			const pr = phone.prefix!;
			obj.name = [pr.name];
			obj.file = pr.files;
			obj.prefix = pr.prefix;
			break;
		}
		case 'sampleSet': {
			const set = phone.sampleSet!;
			obj.name = [set.name];
			obj.variants = set.variants.map(serializeVariant);
			break;
		}
	}

	// Shared metadata — only include non-empty values
	if (phone.reviewScore) obj.reviewScore = phone.reviewScore;
	if (phone.reviewLink) obj.reviewLink = phone.reviewLink;
	if (phone.shopLink) obj.shopLink = phone.shopLink;
	if (phone.price) obj.price = phone.price;
	if (phone.description) obj.description = phone.description;
	if (phone.links?.length) {
		const links = phone.links.filter((l) => l.label.trim() && l.url.trim());
		if (links.length) {
			obj.links = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
		}
	}

	// Preserved unknown keys
	if (phone.passthrough) {
		for (const [k, v] of Object.entries(phone.passthrough)) {
			if (!(k in obj)) obj[k] = v;
		}
	}

	return obj;
}
