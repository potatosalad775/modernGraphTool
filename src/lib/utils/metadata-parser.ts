import type {
	FRDataType,
	PhoneMetadata,
	BrandMetadata,
	TargetMetadata,
	TargetManifestEntry,
	RawBrandData,
	RawPhoneData,
	PhoneFileReference,
	PhoneFileVariant
} from '$lib/types/data-types.js';
import { getConfigValue } from './config.js';

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

				// Common properties for all phone types
				const basePhone = {
					brand: brandName,
					...(typeof phone === 'object' && phone.reviewScore && { reviewScore: phone.reviewScore }),
					...(typeof phone === 'object' && phone.reviewLink && { reviewLink: phone.reviewLink }),
					...(typeof phone === 'object' && phone.shopLink && { shopLink: phone.shopLink }),
					...(typeof phone === 'object' && phone.price && { price: phone.price }),
					...(typeof phone === 'object' && phone.description && { description: phone.description })
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

				// Build regular FR variants from file[] / file.
				const fileVariants: PhoneFileVariant[] = phone.file
					? Array.isArray(phone.file)
						? phone.file.map((file, index) => ({
								suffix: this._getSuffix(phone, index),
								fullName: (brandName + ' ' + baseName + ' ' + this._getSuffix(phone, index)).trim(),
								files: { L: `${file} L.txt`, R: `${file} R.txt` },
								fileName: file,
								...(phone.samples && {
									sampleFiles: this._generateSampleFiles(file, phone.samples),
									sampleCount: phone.samples
								})
							}))
						: [
								{
									suffix: this._getSuffix(phone, 0),
									fullName: (brandName + ' ' + baseName + ' ' + this._getSuffix(phone, 0)).trim(),
									files: {
										L: `${phone.file} L.txt`,
										R: `${phone.file} R.txt`
									},
									fileName: (phone.file as string) || baseName,
									...(phone.samples && {
										sampleFiles: this._generateSampleFiles(
											(phone.file as string) || baseName,
											phone.samples
										),
										sampleCount: phone.samples
									})
								}
							]
					: [];

				// Build HpTF-only variants from hptfs[]. Each entry becomes its own
				// independent variant alongside any regular file variants.
				const hptfVariants: PhoneFileVariant[] = (phone.hptfs ?? []).map((entry) => {
					const entrySuffix = entry.suffix ?? '';
					const placeholderFile = entry.files[0];
					return {
						suffix: entrySuffix,
						fullName: (brandName + ' ' + baseName + ' ' + entrySuffix).trim(),
						// Placeholder main-channel files — unused when hptfOnly is true,
						// but the field is required by the PhoneFileVariant type.
						files: { L: `${placeholderFile} L.txt`, R: `${placeholderFile} R.txt` },
						fileName: placeholderFile,
						hptfFiles: this._generateHpTFFiles(entry.files),
						hptfLabels: entry.labels ?? entry.files,
						hptfFillOnly: entry.fillOnly ?? true,
						hptfDescription: entry.description,
						hptfOnly: true
					};
				});

				phoneEntries.push({
					...basePhone,
					name: baseName,
					identifier,
					files: [...fileVariants, ...hptfVariants]
				});
			});

			out.push({
				brand: brandName,
				phones: phoneEntries
			});
		});

		return out;
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

	/** Generate HpTF sample file references */
	_generateHpTFFiles(fileNames: string[]): PhoneFileReference[] {
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
