/**
 * phoneBookConverter — parse and serialize phone_book.json for the GUI editor.
 *
 * Matches the actual parser in src/lib/utils/metadata-parser.ts:
 *  - brand key is `name` (not `brand`)
 *  - phone-level `description` (not `notes`)
 *  - HpTF blocks discard `file`/`suffix` on the same entry
 *
 * Import is permissive: it also accepts `brand` as the brand key (legacy docs).
 * Export is canonical: always writes `name`.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type PhoneKind = 'simple' | 'detailed' | 'variations' | 'prefix' | 'multiSample' | 'hptf';

export interface SharedPhoneMeta {
	reviewScore?: string;
	reviewLink?: string;
	shopLink?: string;
	price?: string;
	description?: string;
}

export interface BrandState {
	id: string;
	name: string;
	suffix?: string;
	phones: PhoneState[];
}

/** One HpTF measurement set within an hptfs[] array. */
export interface HpTFEntry {
	/** Variant suffix shown in the device selector dropdown (e.g. "Leather Pad"). */
	suffix?: string;
	rows: Array<{ file: string; label: string }>;
	description?: string;
	fillOnly: boolean;
}

export interface PhoneState extends SharedPhoneMeta {
	id: string;
	kind: PhoneKind;
	simple?: { value: string };
	detailed?: { name: string; file: string; suffix?: string };
	variations?: { name: string; rows: Array<{ file: string; suffix: string }> };
	prefix?: { name: string; prefix: string; files: string[] };
	multiSample?: { name: string; file: string; samples: number; suffix?: string };
	hptfs?: {
		/** Device display name (shared across all HpTF entries). */
		name: string;
		/** One or more HpTF measurement sets — each becomes its own variant. */
		entries: HpTFEntry[];
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
		case 'multiSample':
			base.multiSample = { name: '', file: '', samples: 3 };
			break;
		case 'hptf':
			base.hptfs = {
				name: '',
				entries: [
					{
						rows: [
							{ file: '', label: 'Center' },
							{ file: '', label: 'Front' },
							{ file: '', label: 'Back' },
							{ file: '', label: 'Up' },
							{ file: '', label: 'Down' }
						],
						fillOnly: true
					}
				]
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
			case 'multiSample':
				fresh.multiSample!.name = oldName;
				break;
			case 'hptf':
				fresh.hptfs!.name = oldName;
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
		case 'multiSample':
			return phone.multiSample?.name ?? '';
		case 'hptf':
			return phone.hptfs?.name ?? '';
	}
}

// ── Parse: JSON text → PhoneBookState ───────────────────────────────────────

const KNOWN_PHONE_KEYS = new Set([
	'name',
	'file',
	'suffix',
	'prefix',
	'samples',
	'hptfs',
	'reviewScore',
	'reviewLink',
	'shopLink',
	'price',
	'description'
]);

const KNOWN_BRAND_KEYS = new Set(['name', 'brand', 'suffix', 'phones']);

export function parsePhoneBook(jsonText: string): ParseResult {
	const warnings: string[] = [];
	let raw: unknown;
	try {
		raw = JSON.parse(jsonText);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw new Error(`Invalid JSON: ${msg}`);
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

	const withShared = (phone: PhoneState): PhoneState => ({
		...phone,
		...shared,
		passthrough: Object.keys(passthrough).length ? passthrough : undefined
	});

	const baseName = extractBaseName(p.name);

	// hptfs[] block → HpTF. Each array entry becomes its own variant in the
	// device selector. If the same phone also declares file/suffix variants,
	// the editor can only represent one kind at a time — warn the user that
	// the file[] / suffix[] side will be lost on re-export.
	if (Array.isArray(p.hptfs) && p.hptfs.length > 0) {
		if (p.file !== undefined || p.suffix !== undefined) {
			warnings.push(
				`Brand "${brandLabel}" phone "${baseName || phoneIdx}": phone has both "file"/"suffix" and "hptfs" — the editor will only show the HpTF sets. Hand-edit the JSON to keep both.`
			);
		}
		const entries: HpTFEntry[] = p.hptfs.map((raw, entryIdx) => {
			if (typeof raw !== 'object' || raw == null || Array.isArray(raw)) {
				warnings.push(
					`Brand "${brandLabel}" phone "${baseName || phoneIdx}": hptfs[${entryIdx}] is not an object, coerced to empty.`
				);
				return { rows: [], fillOnly: true };
			}
			const h = raw as Record<string, unknown>;
			const files = Array.isArray(h.files) ? h.files.map(String) : [];
			const labels = Array.isArray(h.labels) ? h.labels.map(String) : files;
			const rows = files.map((file, i) => ({ file, label: labels[i] ?? file }));
			return {
				suffix: typeof h.suffix === 'string' ? h.suffix : undefined,
				rows,
				description: typeof h.description === 'string' ? h.description : undefined,
				fillOnly: typeof h.fillOnly === 'boolean' ? h.fillOnly : true
			};
		});
		return withShared({
			id: makeId('phone'),
			kind: 'hptf',
			hptfs: { name: baseName, entries }
		});
	}

	// samples → multiSample
	if (typeof p.samples === 'number') {
		const file = Array.isArray(p.file)
			? String(p.file[0] ?? '')
			: typeof p.file === 'string'
				? p.file
				: '';
		const suffix = Array.isArray(p.suffix)
			? String(p.suffix[0] ?? '')
			: typeof p.suffix === 'string'
				? p.suffix
				: '';
		return withShared({
			id: makeId('phone'),
			kind: 'multiSample',
			multiSample: { name: baseName, file, samples: p.samples, suffix: suffix || undefined }
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
		case 'multiSample': {
			const ms = phone.multiSample!;
			obj.name = [ms.name];
			obj.file = [ms.file];
			obj.suffix = [ms.suffix ?? ''];
			obj.samples = ms.samples;
			break;
		}
		case 'hptf': {
			const h = phone.hptfs!;
			obj.name = [h.name];
			obj.hptfs = h.entries.map((entry) => ({
				...(entry.suffix ? { suffix: entry.suffix } : {}),
				files: entry.rows.map((r) => r.file),
				labels: entry.rows.map((r) => r.label),
				...(entry.description ? { description: entry.description } : {}),
				...(entry.fillOnly === false ? { fillOnly: false } : {})
			}));
			break;
		}
	}

	// Shared metadata — only include non-empty values
	if (phone.reviewScore) obj.reviewScore = phone.reviewScore;
	if (phone.reviewLink) obj.reviewLink = phone.reviewLink;
	if (phone.shopLink) obj.shopLink = phone.shopLink;
	if (phone.price) obj.price = phone.price;
	if (phone.description) obj.description = phone.description;

	// Preserved unknown keys
	if (phone.passthrough) {
		for (const [k, v] of Object.entries(phone.passthrough)) {
			if (!(k in obj)) obj[k] = v;
		}
	}

	return obj;
}
