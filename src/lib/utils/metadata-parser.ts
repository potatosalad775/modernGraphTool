import type {
	FRDataType,
	PhoneMetadata,
	BrandMetadata,
	TargetMetadata,
	TargetManifestEntry,
	RawBrandData,
	RawPhoneData,
	RawSampleSet,
	RawVariant,
	PhoneFileReference,
	PhoneFileVariant,
	PhoneLink,
	SampleDisplayMode
} from '$lib/types/data-types.js';
import { getConfigValue } from './config.js';
import { sanitizeUrl, stripHtml } from './html-sanitizer.js';
import {
	defaultSampleCount,
	defaultSampleDisplay,
	legacyHptfDisplay,
	legacyMultiSampleDisplay,
	normalizeDisplayModes
} from './sample-config.js';

/**
 * Metadata Parser for phone and target data
 * Handles parsing and management of device metadata from phone_book.json and config files
 */
const MetadataParser = {
	phoneMetadata: null as BrandMetadata[] | null,
	targetMetadata: null as TargetManifestEntry[] | null,

	/** Initialize metadata parser and load data */
	async init(): Promise<void> {
		if (!this.phoneMetadata) {
			this.phoneMetadata = await this._fetchBookObject();
		}
		if (!this.targetMetadata) {
			this.targetMetadata = this._fetchTargetObject();
		}
	},

	/** Check if Phone object is included in phoneMetadata (phone_book.json). */
	isPhoneAvailable(identifier: string): boolean {
		if (!this.phoneMetadata) return false;

		return (
			this.phoneMetadata.some((brand) =>
				brand.phones.some((phone) => phone.identifier === identifier)
			) || // Try Full-Name search if it doesn't exist
			this.phoneMetadata.some((brand) =>
				brand.phones.some((phone) => {
					// Handle both array and single file cases
					return phone.files.some((file) => {
						// If it's an object with fullName property
						if (file.fullName) return file.fullName === identifier;
						// If it's a string, construct the full name
						const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
						const fullName = brand.brand + ' ' + baseName + ' ' + file.suffix;
						return fullName === identifier;
					});
				})
			)
		);
	},

	/** Check if Target object is included in targetMetadata (config.js). */
	isTargetAvailable(identifier: string): boolean {
		if (!this.targetMetadata) return false;

		return this.targetMetadata.some((obj) =>
			obj.files.some(
				(file) =>
					(file.includes(' Target') ? file : `${file} Target`) ===
					(identifier.includes(' Target') ? identifier : `${identifier} Target`)
			)
		);
	},

	/** Get Frequency Response Metadata from phone_book.json if available. */
	getFRMetadata(sourceType: FRDataType, identifier: string): PhoneMetadata | TargetMetadata {
		if (sourceType === 'phone') {
			if (!this.phoneMetadata) {
				throw new Error('Phone metadata not loaded');
			}

			// Find matching phone in transformed metadata
			for (const brand of this.phoneMetadata) {
				const phone = brand.phones.find((p) => p.identifier === identifier);
				if (phone) {
					return phone;
				}
			}
			// If it fails, try searching fullName
			return this.searchFRInfoWithFullName(identifier);
		} else if (sourceType === 'target') {
			return {
				identifier: identifier,
				files: [
					{
						files: `${identifier}.txt`
					}
				]
			};
		} else {
			const fallback: TargetMetadata = {
				identifier: identifier,
				files: [{ files: `${identifier}.txt` }]
			};
			return fallback;
		}
	},

	/** Search Frequency Response Metadata from phone_book.json with fullName. */
	searchFRInfoWithFullName(inputStr: string): PhoneMetadata {
		if (!this.phoneMetadata) {
			throw new Error('Phone metadata not loaded');
		}

		// Search through all brands and phones
		for (const brand of this.phoneMetadata) {
			for (const phone of brand.phones) {
				// Check all file variations
				for (const file of phone.files) {
					if (
						file.fullName.toLowerCase() === inputStr.toLowerCase() ||
						file.fileName.toLowerCase() === inputStr.toLowerCase() ||
						file.fileName.replace(' ', '_').toLowerCase() === inputStr.toLowerCase()
					) {
						return {
							...phone,
							dispSuffix: file.suffix || '' // Return matching suffix as well
						};
					}
				}
				// Check identifier if fullName does not match
				if (phone.identifier.toLowerCase() === inputStr.toLowerCase()) {
					return {
						...phone,
						dispSuffix: phone.files[0].suffix
					};
				}
			}
		}
		throw new Error(`No such data found: ${inputStr}`);
	},

	/** Search Target data from config.js with fullName. */
	searchTargetInfoWithFullName(inputStr: string): TargetMetadata {
		if (!this.targetMetadata) {
			throw new Error('Target metadata not loaded');
		}

		const normalizedInput = inputStr.includes(' Target') ? inputStr : `${inputStr} Target`;

		for (const obj of this.targetMetadata) {
			for (const file of obj.files) {
				const normalizedFile = file.includes(' Target') ? file : `${file} Target`;
				if (normalizedInput.includes(normalizedFile)) {
					return {
						identifier: normalizedFile,
						files: [{ files: `${normalizedFile}.txt` }]
					};
				}
			}
		}

		throw new Error(`No such target data found: ${inputStr}`);
	},

	/** Fetch phone_book metadata from (phone_book.json). */
	async _fetchBookObject(): Promise<BrandMetadata[]> {
		const phonebookPath =
			(getConfigValue('PATH.PHONE_BOOK') as string) || '../../../data/phone_book.json';
		const rawData: unknown = await fetch(phonebookPath).then((r) => r.json());

		if (!Array.isArray(rawData)) {
			console.warn('[modernGraphTool] phone_book.json is not an array — ignoring entire file.');
			return [];
		}

		const out: BrandMetadata[] = [];

		rawData.forEach((brand, brandIdx) => {
			// Skip entries that aren't plain objects (e.g. null, arrays, primitives).
			if (typeof brand !== 'object' || brand === null || Array.isArray(brand)) {
				console.warn(
					`[modernGraphTool] phone_book.json: brand #${brandIdx} is not an object — skipping.`
				);
				return;
			}

			const b = brand as Partial<RawBrandData>;
			const brandName = [b.name, b.suffix].filter(Boolean).join(' ');
			const brandDefaults = this._normalizeSampleSet(b.defaultSamples);

			if (!brandName) {
				console.warn(
					`[modernGraphTool] phone_book.json: brand #${brandIdx} has no name — skipping.`
				);
				return;
			}

			// Tolerate missing/null/non-array `phones` — treat as no phones rather
			// than crashing the whole fetch.
			if (!Array.isArray(b.phones)) {
				console.warn(
					`[modernGraphTool] phone_book.json: brand "${brandName}" has invalid "phones" (expected array) — skipping its phones.`
				);
				out.push({ brand: brandName, phones: [] });
				return;
			}

			const phoneEntries: PhoneMetadata[] = [];
			b.phones.forEach((phone, phoneIdx) => {
				// Skip phone entries that aren't a string or plain object.
				if (
					typeof phone !== 'string' &&
					(typeof phone !== 'object' || phone === null || Array.isArray(phone))
				) {
					console.warn(
						`[modernGraphTool] phone_book.json: brand "${brandName}" phone #${phoneIdx} is not a string or object — skipping.`
					);
					return;
				}

				const links =
					typeof phone === 'object'
						? this._parseLinks(phone.links, `brand "${brandName}" phone #${phoneIdx}`)
						: undefined;

				// Common properties for all phone types
				const basePhone = {
					brand: brandName,
					...(typeof phone === 'object' && phone.reviewScore && { reviewScore: phone.reviewScore }),
					...(typeof phone === 'object' && phone.reviewLink && { reviewLink: phone.reviewLink }),
					...(typeof phone === 'object' && phone.shopLink && { shopLink: phone.shopLink }),
					...(typeof phone === 'object' && phone.price && { price: phone.price }),
					...(typeof phone === 'object' && phone.description && { description: phone.description }),
					...(links && { links })
				};

				// If phone is a string, it's a single phone
				if (typeof phone === 'string') {
					phoneEntries.push({
						...basePhone,
						name: phone,
						identifier: brandName + ' ' + phone,
						files: [
							{
								suffix: this._getSuffix(phone, 0),
								fullName: (brandName + ' ' + phone + ' ' + this._getSuffix(phone, 0)).trim(),
								files: { L: phone + ' L.txt', R: phone + ' R.txt' },
								fileName: phone
							}
						]
					});
					return;
				}

				// If phone is an object, it has multiple phones
				const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
				const identifier = brandName + ' ' + baseName;

				// `variants[]` composes with the terse phone-level form rather than
				// replacing it, so one phone can declare its plain measurements the way
				// every CrinGraph-derived tool reads them and still carry sample sets
				// here. Both paths emit the same PhoneFileVariant[], so nothing
				// downstream can tell which form was authored.
				const explicit = Array.isArray(phone.variants) ? phone.variants : null;
				const legacy = this._parseLegacyVariants(brandName, baseName, phone, explicit === null);
				const files = explicit
					? this._mergeVariants(
							legacy,
							this._parseVariants(brandName, baseName, explicit, brandDefaults)
						)
					: legacy;

				phoneEntries.push({
					...basePhone,
					name: baseName,
					identifier,
					files
				});
			});

			out.push({
				brand: brandName,
				phones: phoneEntries
			});
		});

		return out;
	},

	/**
	 * Validate a phone's operator-authored `links` array.
	 *
	 * Entries are dropped individually rather than rejecting the whole list — one
	 * typo in a hand-edited phone_book.json shouldn't cost an operator the other
	 * links on that device. Labels are flattened to text and URLs go through
	 * `sanitizeUrl`, so nothing downstream has to re-check either.
	 */
	_parseLinks(raw: unknown, context: string): PhoneLink[] | undefined {
		if (raw == null) return undefined;
		if (!Array.isArray(raw)) {
			console.warn(
				`[modernGraphTool] phone_book.json: ${context} has invalid "links" (expected array) — ignoring.`
			);
			return undefined;
		}

		const out: PhoneLink[] = [];
		raw.forEach((entry, i) => {
			if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
				console.warn(
					`[modernGraphTool] phone_book.json: ${context} link #${i} is not an object — skipping.`
				);
				return;
			}
			const { label, url } = entry as { label?: unknown; url?: unknown };
			const cleanLabel = typeof label === 'string' ? stripHtml(label) : '';
			const cleanUrl = typeof url === 'string' ? sanitizeUrl(url) : null;
			if (!cleanLabel || !cleanUrl) {
				console.warn(
					`[modernGraphTool] phone_book.json: ${context} link #${i} needs a "label" and a safe "url" — skipping.`
				);
				return;
			}
			out.push({ label: cleanLabel, url: cleanUrl });
		});

		return out.length ? out : undefined;
	},

	/** Fetch target_manifest metadata from (config.js). */
	_fetchTargetObject(): TargetManifestEntry[] {
		const manifest = (getConfigValue('TARGET_MANIFEST') || []) as TargetManifestEntry[];
		return manifest
			.filter((obj) => Array.isArray(obj.files))
			.map((obj) => {
				return {
					type: obj.type,
					files: obj.files.map((identifier) => {
						return identifier.includes(' Target') ? identifier : `${identifier} Target`;
					})
				};
			});
	},

	// ── Variant parsing ───────────────────────────────────────────────────────

	/** Normalize the number shorthand so only one shape flows onward. */
	_normalizeSampleSet(raw: number | RawSampleSet | undefined | null): RawSampleSet | null {
		if (raw == null) return null;
		if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? { count: raw } : null;
		if (typeof raw !== 'object' || Array.isArray(raw)) return null;
		return raw;
	},

	/**
	 * Resolve a variant's run count and display set.
	 *
	 * Count:   `variant.samples.count` → `brand.defaultSamples` → `SAMPLES.DEFAULT_COUNT` → 1
	 * Display: `variant.samples.display` → `brand.defaultSamples.display` → `SAMPLES.DEFAULT_DISPLAY`
	 */
	_resolveSampleDefaults(
		raw: RawSampleSet | null,
		brandDefaults: RawSampleSet | null
	): { count: number; display: SampleDisplayMode[] } {
		const count =
			raw?.count ?? brandDefaults?.count ?? (raw?.files ? raw.files.length : defaultSampleCount());
		const display =
			normalizeDisplayModes(raw?.display) ??
			normalizeDisplayModes(brandDefaults?.display) ??
			defaultSampleDisplay();
		return { count, display };
	},

	/**
	 * Build variants from the explicit `variants[]` form.
	 *
	 * A variant is a sample set when it declares `samples.files`, or when the
	 * resolved run count is above 1. Anything else is an ordinary L/R pair.
	 */
	_parseVariants(
		brandName: string,
		baseName: string,
		variants: RawVariant[],
		brandDefaults: RawSampleSet | null
	): PhoneFileVariant[] {
		return variants
			.filter((v): v is RawVariant => typeof v === 'object' && v !== null && !Array.isArray(v))
			.map((entry) => {
				const suffix = (entry.suffix ?? '').trim();
				const raw = this._normalizeSampleSet(entry.samples);
				const { count, display } = this._resolveSampleDefaults(raw, brandDefaults);

				const explicitFiles = Array.isArray(raw?.files) ? raw.files : null;
				const fileName = entry.file ?? explicitFiles?.[0] ?? baseName;

				const variant: PhoneFileVariant = {
					suffix,
					fullName: (brandName + ' ' + baseName + ' ' + suffix).trim(),
					fileName
				};

				// The main L/R pair only exists when the operator named a file. A set
				// declared purely through `samples.files` has no unnumbered pair to
				// fetch — its main curve is the average across runs.
				if (entry.file || !explicitFiles) {
					variant.files = { L: `${fileName} L.txt`, R: `${fileName} R.txt` };
				}

				if (explicitFiles) {
					variant.sampleFiles = this._generateExplicitSampleFiles(explicitFiles);
					variant.sampleLabels = raw?.labels ?? explicitFiles;
				} else if (count > 1 || (raw?.count ?? 0) > 0) {
					// An explicit `count` — even `1` — declares the numbered-file layout.
					// A count of 1 arriving only from a default is just "no sample set".
					variant.sampleFiles = this._generateSampleFiles(fileName, count);
					if (raw?.labels) variant.sampleLabels = raw.labels;
				}

				if (variant.sampleFiles) {
					variant.sampleDisplay = display;
					if (raw?.description) variant.sampleDescription = raw.description;
				}

				return variant;
			});
	},

	/**
	 * Fold the explicit `variants[]` entries into the ones derived from the terse
	 * `file`/`suffix`/`prefix`/`samples`/`hptfs` form.
	 *
	 * Matching is by `fileName`. An entry naming a measurement the phone already
	 * declared **replaces it in place**, so enriching a variant with a sample set
	 * never moves it — `files[0]` stays the phone's default curve, which
	 * `fr-parser` loads when no suffix is requested and `searchFRInfoWithFullName`
	 * reports as `dispSuffix`. Anything else appends after the legacy entries,
	 * matching how `hptfs[]` — the key `variants[]` supersedes — has always
	 * combined with `file[]`.
	 *
	 * The point is dual-hosting: `variants[]` is modernGraphTool's own key, so a
	 * phone that declared its measurements only there is invisible to CrinGraph,
	 * which reads `file` and nothing else. Composing lets both keys coexist on one
	 * entry without the plain variants showing up twice.
	 */
	_mergeVariants(legacy: PhoneFileVariant[], explicit: PhoneFileVariant[]): PhoneFileVariant[] {
		const merged = [...legacy];
		explicit.forEach((variant) => {
			const at = merged.findIndex((existing) => existing.fileName === variant.fileName);
			if (at === -1) merged.push(variant);
			else merged[at] = variant;
		});
		return merged;
	},

	/**
	 * Build variants from the terse legacy form: `file[]`/`suffix[]`/`prefix` with
	 * an optional phone-level `samples: N`, plus one variant per `hptfs[]` entry.
	 *
	 * Read permanently, not just for migration — operators hand-author
	 * `phone_book.json` and most existing databases only speak this dialect.
	 * (Cross-site search isn't the reason: the squig.link crawl reads names out of
	 * a foreign book directly and never comes through here.)
	 *
	 * `allowNameFallback` is off when `variants[]` is also present: the name-derived
	 * variant below exists so a phone with no `file` still has something to load,
	 * and a phone declaring `variants[]` already does.
	 */
	_parseLegacyVariants(
		brandName: string,
		baseName: string,
		phone: RawPhoneData,
		allowNameFallback = true
	): PhoneFileVariant[] {
		const sampleCount = phone.samples;
		const multiSampleDisplay = legacyMultiSampleDisplay();

		const buildFileVariant = (file: string, index: number): PhoneFileVariant => {
			const suffix = this._getSuffix(phone, index);
			const variant: PhoneFileVariant = {
				suffix,
				fullName: (brandName + ' ' + baseName + ' ' + suffix).trim(),
				files: { L: `${file} L.txt`, R: `${file} R.txt` },
				fileName: file
			};
			if (sampleCount && sampleCount > 0) {
				variant.sampleFiles = this._generateSampleFiles(file, sampleCount);
				variant.sampleDisplay = multiSampleDisplay;
			}
			return variant;
		};

		const hptfEntries = Array.isArray(phone.hptfs) ? phone.hptfs : [];

		// An object phone with no `file` falls back to its own name, the same way a
		// string phone does — otherwise it would produce no variant at all and
		// `getFRDataFromMetadata` would have no `files[0]` to load. A phone whose
		// only measurements are `hptfs[]` or `variants[]` entries keeps an empty
		// file list, so the fallback doesn't add a phantom variant beside them.
		const fileVariants: PhoneFileVariant[] = phone.file
			? Array.isArray(phone.file)
				? phone.file.map(buildFileVariant)
				: [buildFileVariant((phone.file as string) || baseName, 0)]
			: hptfEntries.length > 0 || !allowNameFallback
				? []
				: [buildFileVariant(baseName, 0)];

		// Each hptfs[] entry becomes its own variant alongside the file variants.
		// Entries are operator-authored, so a malformed one is skipped rather than
		// allowed to abort the whole phone book.
		const hptfVariants: PhoneFileVariant[] = hptfEntries
			.filter((entry) => entry && typeof entry === 'object')
			.map((entry) => {
				const suffix = entry.suffix ?? '';
				const files = Array.isArray(entry.files) ? entry.files : [];
				return {
					suffix,
					fullName: (brandName + ' ' + baseName + ' ' + suffix).trim(),
					fileName: files[0] ?? baseName,
					sampleFiles: this._generateExplicitSampleFiles(files),
					sampleLabels: entry.labels ?? files,
					sampleDisplay: legacyHptfDisplay(entry.fillOnly ?? true),
					...(entry.description && { sampleDescription: entry.description })
				};
			});

		return [...fileVariants, ...hptfVariants];
	},

	/** Sample file references from explicit base filenames */
	_generateExplicitSampleFiles(fileNames: string[]): PhoneFileReference[] {
		return fileNames.map((f) => ({
			L: `${f} L.txt`,
			R: `${f} R.txt`
		}));
	},

	/** Generate sample file references for multi-sample measurements */
	_generateSampleFiles(fileName: string, sampleCount: number): PhoneFileReference[] {
		return Array.from({ length: sampleCount }, (_, i) => ({
			L: `${fileName} L${i + 1}.txt`,
			R: `${fileName} R${i + 1}.txt`,
			...(i === 0 && {
				fallback: { L: `${fileName} L.txt`, R: `${fileName} R.txt` }
			})
		}));
	},

	/** Get suffix for phone variants */
	_getSuffix(phone: RawPhoneData | string, index: number | null = null): string {
		if (typeof phone === 'string') {
			return '';
		}

		if (Array.isArray(phone.file)) {
			// Handle array cases
			if (Array.isArray(phone.suffix) && index !== null) {
				// Distinguish "suffix explicitly empty" from "suffix missing".
				// An explicit "" is a valid "no suffix" intent — don't fall back to the
				// index (which would stringify to "0" and show up as a stray label).
				const entry = phone.suffix[index];
				return typeof entry === 'string' ? entry.trim() : String(index);
			} else if (typeof phone.suffix === 'string') {
				return phone.suffix.trim() || String(index);
			} else if (Array.isArray(phone.prefix) && index !== null) {
				return phone.file[index]?.replace(new RegExp(phone.prefix[index], 'i'), '').trim() || '';
			} else if (typeof phone.prefix === 'string' && index !== null) {
				return phone.file[index]?.replace(new RegExp(phone.prefix, 'i'), '').trim() || '';
			} else {
				return '';
			}
		} else {
			// Handle string cases
			if (typeof phone.suffix === 'string') {
				return phone.suffix.trim() || phone.file?.trim() || '';
			} else if (typeof phone.prefix === 'string' && phone.file) {
				return phone.file.replace(new RegExp(phone.prefix, 'i'), '').trim();
			} else {
				return '';
			}
		}
	}
};

export default MetadataParser;
