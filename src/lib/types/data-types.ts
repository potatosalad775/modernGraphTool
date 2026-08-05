/**
 * Type definitions for modernGraphTool data structures.
 * Converted from JSDoc typedefs (data-types.js).
 */

// ── Core FR data ──────────────────────────────────────────────────────────────

/** Frequency response data point [frequency_hz, amplitude_db] */
export type FRDataPoint = [number, number];

/** Channel data containing frequency response measurements */
export interface ChannelData {
	data: FRDataPoint[];
	metadata: {
		weights?: number[];
		minFreq: number;
		maxFreq: number;
	};
}

/** Raw frequency response data structure from parser */
export interface ParsedFRData {
	L?: ChannelData;
	R?: ChannelData;
	AVG?: ChannelData;
}

/** Cached raw FR data (parsed + interpolated, NOT smoothed or normalized).
 *  Used by reSmoothAll() to avoid re-fetching from the network. */
export interface RawFRCache {
	channels: ParsedFRData;
	samples?: SampleData[];
	sampleLabels?: string[];
	sampleDisplay?: SampleDisplayMode[];
	sampleDescription?: string;
}

// ── Sample sets ───────────────────────────────────────────────────────────────

/**
 * One measurement run inside a sample set. `label` is optional curator metadata;
 * `AVG` is derived from L and R by the processing pipeline, not fetched.
 */
export interface SampleData {
	label?: string;
	L?: ChannelData;
	R?: ChannelData;
	AVG?: ChannelData;
}

/** Min/max envelope computed across every run in a sample set */
export interface SampleEnvelope {
	upper: FRDataPoint[];
	lower: FRDataPoint[];
}

/**
 * How a sample set is drawn. A set, not an enum — `['avg','fill']` is an
 * averaged line with a variance band around it.
 *
 *  - `avg`    — draw the averaged main channels
 *  - `curves` — expose per-run curves (seeds `dispSamples`)
 *  - `fill`   — draw the min/max envelope as a filled band
 */
export type SampleDisplayMode = 'avg' | 'curves' | 'fill';

/** Display key for one run's curve, e.g. "sample0_AVG", "sample1_L".
 *  Zero-based to match the keys already present in legacy `?state=` URLs. */
export type SampleDisplayKey = `sample${number}_${'L' | 'R' | 'AVG'}`;

/** Color scheme for frequency response traces */
export interface FRColors {
	L?: string;
	R?: string;
	AVG: string;
	/** Colors for individual sample traces, keyed by SampleDisplayKey like 'sample0_L' */
	samples?: Record<string, string>;
}

/** FR data type discriminant */
export type FRDataType =
	'phone' | 'target' | 'eq' | 'inserted-phone' | 'inserted-target' | 'inserted-eq';

/** Complete frequency response data object stored in DataProvider */
export interface FRDataObject {
	uuid: string;
	type: FRDataType;
	identifier: string;
	channels: ParsedFRData;
	dispChannel: ('L' | 'R' | 'AVG')[];
	dispSuffix?: string | null;
	/** Short summary of TargetCustomizer adjustments, e.g. "(Tilt: -0.8dB/oct, Bass: +6.0dB)". */
	adjustmentLabel?: string | null;
	colors: FRColors;
	dash: string;
	meta?: PhoneMetadata | TargetMetadata;
	hidden?: boolean;
	yOffset?: number;
	/** Sample set. If present, `channels` holds the computed averages across runs. */
	samples?: SampleData[];
	/** Which individual sample curves to display (independent of dispChannel). */
	dispSamples?: SampleDisplayKey[];
	/** Whether the averaged main channels are drawn. Absent means "yes" (plain curve). */
	showAvg?: boolean;
	/** Whether the min/max envelope fill is drawn. */
	showFill?: boolean;
	/** Min/max envelope across the set, per channel. Present when the set can be filled. */
	envelope?: Record<'L' | 'R' | 'AVG', SampleEnvelope>;
	/** Curator caption describing what the set's deviation represents. */
	sampleDescription?: string;
	/** Cached raw (unsmoothed, unnormalized) data for re-smoothing without re-fetching. */
	_rawData?: RawFRCache;
}

/** Input metadata for adding FR data */
export interface FRInputMetadata {
	dispSuffix?: string;
	dispChannel?: ('L' | 'R' | 'AVG')[];
}

/** Event data for FR-related events */
export interface FREventData {
	uuid: string;
	identifier: string;
	type?: FRDataType;
}

/** Baseline data for graph compensation */
export interface BaselineData {
	uuid: string | null;
	identifier: string | null;
	channelData: FRDataPoint[] | null;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

/** File reference for phone measurements (L/R channel filenames) */
export interface PhoneFileReference {
	L: string;
	R: string;
	/** Fallback L/R files to try if the primary pair 404s.
	 *  Used by sample-1 of multi-sample variants to fall back to unnumbered
	 *  "Foo L.txt"/"Foo R.txt" when "Foo L1.txt"/"Foo R1.txt" don't exist. */
	fallback?: { L: string; R: string };
}

/** File variant for phones with multiple measurement variants */
export interface PhoneFileVariant {
	suffix: string;
	fullName: string;
	/** Main L/R pair. Absent on variants that are a sample set with no `file` of
	 *  their own — the averaged runs are the main curve there. */
	files?: PhoneFileReference;
	fileName: string;
	/** Per-run file references. Present only when this variant is a sample set. */
	sampleFiles?: PhoneFileReference[];
	/** Human-readable label per run, same length as sampleFiles. */
	sampleLabels?: string[];
	/** How the set is drawn. Seeds the runtime toggles; the user can change them. */
	sampleDisplay?: SampleDisplayMode[];
	/** Curator caption shown with the set (e.g. "(Positional Variance)"). */
	sampleDescription?: string;
}

/**
 * A sample set declared inside `variants[]`. A bare number is shorthand for
 * `{ count: n }` and is normalized at the parser's entry point.
 */
export interface RawSampleSet {
	/** Numbered-file convention: `{file} L1.txt`…`L{count}.txt`. */
	count?: number;
	/** Explicit base filenames, one per run (L/R derived by appending " L.txt"/" R.txt"). */
	files?: string[];
	/** Human-readable labels per run. Defaults to `files`, else "Sample {n}". */
	labels?: string[];
	/** Which of avg / curves / fill to draw. Defaults resolve through the config chain. */
	display?: SampleDisplayMode[];
	/** Curator caption shown under the device name (e.g. "(Positional Variance)"). */
	description?: string;
}

/** One entry of the `variants[]` form — the explicit, per-variant schema. */
export interface RawVariant {
	/** Variant suffix shown in the device selector dropdown. */
	suffix?: string;
	/** Base filename for the main L/R pair. Optional when `samples.files` is given. */
	file?: string;
	/** Sample set for this variant. A number is shorthand for `{ count: n }`. */
	samples?: number | RawSampleSet;
}

/** Single HpTF measurement set declared in phone_book.json (legacy schema) */
export interface RawHpTFEntry {
	/** Variant suffix shown in the device selector dropdown (e.g. "Leather Pad"). */
	suffix?: string;
	/** Base filenames for each HpTF sample (L/R derived by appending " L.txt"/" R.txt"). */
	files: string[];
	/** Human-readable labels per sample, same length as files. Defaults to files. */
	labels?: string[];
	/** When true, only the deviation fill envelope is shown — no individual curve toggles. Default: true. */
	fillOnly?: boolean;
	/** Curator caption shown under the device name (e.g. "(Positional Variance)"). */
	description?: string;
}

/**
 * An operator-authored link shown on an expanded device row, alongside the
 * built-in Review / Shop links. Free-form so a database can list several shops,
 * a manufacturer page, a measurement note — whatever it has.
 */
export interface PhoneLink {
	/** Link text. Plain text — markup is stripped before it is rendered. */
	label: string;
	/** Destination. Only http / https / mailto / tel and relative URLs survive parsing. */
	url: string;
}

/** Raw phone data from phone_book.json before processing */
export interface RawPhoneData {
	name: string | string[];
	file?: string | string[];
	suffix?: string | string[];
	prefix?: string | string[];
	reviewScore?: number;
	reviewLink?: string;
	shopLink?: string;
	price?: string;
	/**
	 * Free-form note shown under the device name. A small inline HTML subset is
	 * allowed (`<a>`, `<b>`, `<em>`, `<br>`, …) and everything else is stripped —
	 * see [html-sanitizer.ts](../utils/html-sanitizer.ts).
	 */
	description?: string;
	/** Extra links shown on the expanded row. Invalid entries are dropped at parse time. */
	links?: PhoneLink[];
	/**
	 * Explicit per-variant declarations. When present, `file` / `suffix` / `prefix` /
	 * `samples` / `hptfs` at this level are ignored (precedence, not merging).
	 */
	variants?: RawVariant[];
	/** Legacy: number of measurement samples (e.g. 3 for L1/L2/L3/R1/R2/R3 files) */
	samples?: number;
	/** Legacy: HpTF measurement sets. Each entry becomes its own variant in the selector. */
	hptfs?: RawHpTFEntry[];
}

/** Raw brand data from phone_book.json before processing */
export interface RawBrandData {
	name: string;
	suffix?: string;
	/**
	 * Per-brand defaults for variants that declare no sample set of their own.
	 *
	 * A bare number is shorthand for `{ count: n }`. Only `count` and `display`
	 * are honored (`_resolveSampleDefaults`) — `files`, `labels` and `description`
	 * describe one specific set and are ignored at brand level.
	 */
	defaultSamples?: number | Pick<RawSampleSet, 'count' | 'display'>;
	phones: (string | RawPhoneData)[];
}

/** Phone metadata from phone_book.json */
export interface PhoneMetadata {
	brand: string;
	name: string;
	identifier: string;
	files: PhoneFileVariant[];
	reviewScore?: number | string;
	reviewLink?: string;
	shopLink?: string;
	price?: string;
	/** Raw, unsanitized note as authored. Sanitized at render time, not here. */
	description?: string;
	/** Validated operator links — label non-empty, URL scheme already checked. */
	links?: PhoneLink[];
	dispSuffix?: string;
	extensionData?: unknown;
}

/** Target metadata structure */
export interface TargetMetadata {
	identifier: string;
	files: Array<{ files: string }>;
	extensionData?: unknown;
}

/** Brand metadata from phone_book.json */
export interface BrandMetadata {
	brand: string;
	phones: PhoneMetadata[];
}

/** Target manifest entry from config */
export interface TargetManifestEntry {
	type: string;
	files: string[];
}

// ── Validation & Processing ───────────────────────────────────────────────────

/** Validation result for data parsing */
export interface ValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

/** Configuration for FR data processing */
export interface FRProcessingConfig {
	enableSmoothing: boolean;
	smoothingFactor: number;
	enableNormalization: boolean;
	normalizationFreq: number;
}

// ── App Config ────────────────────────────────────────────────────────────────

/** Internationalized configuration value with language variants */
export interface I18nConfigValue {
	default: unknown;
	i18n: Record<string, unknown>;
}

/** Label position fine-tuning */
export interface LabelPositionConfig {
	LEFT: string;
	RIGHT: string;
	UP: string;
	DOWN: string;
}

/** Label configuration for phone/target/baseline labels */
export interface LabelConfig {
	LOCATION: 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'TOP_LEFT' | 'TOP_RIGHT';
	POSITION: LabelPositionConfig;
	TEXT_SIZE: string;
	TEXT_WEIGHT: string;
}

/** Normalization configuration */
export interface NormalizationConfig {
	TYPE: 'Hz' | 'Avg';
	HZ_VALUE: number;
}

/** Visualization configuration */
export interface VisualizationConfig {
	DEFAULT_Y_SCALE: 30 | 40 | 50 | 60 | 80;
	LABEL: LabelConfig;
	BASELINE_LABEL: LabelConfig;
	RIG_DESCRIPTION: string;
}

/** Target interface configuration */
export interface TargetInterfaceConfig {
	ALLOW_MULTIPLE_LINE_PER_TYPE: boolean;
	OMIT_TARGET_SUFFIX: boolean;
	COLLAPSE_TARGET_LIST_ON_INITIAL: boolean;
}

/** Interface configuration */
export interface InterfaceConfig {
	PREFERRED_DARK_MODE_THEME: 'light' | 'dark' | 'system';
	ALLOW_REMOVING_PHONE_FROM_SELECTOR: boolean;
	SWITCH_PHONE_PANEL_ON_BRAND_CLICK: boolean;
	TARGET: TargetInterfaceConfig;
	HIDE_DEV_DONATE_BUTTON: boolean;
}

/** URL configuration */
export interface URLConfig {
	AUTO_UPDATE_URL: boolean;
	COMPRESS_URL: boolean;
}

/** Language configuration */
export interface LanguageConfig {
	LANGUAGE_LIST: [string, string][];
	ENABLE_I18N: boolean;
	ENABLE_SYSTEM_LANG_DETECTION: boolean;
}

/** Path configuration */
export interface PathConfig {
	PHONE_MEASUREMENT: string;
	TARGET_MEASUREMENT: string;
	PHONE_BOOK: string;
}

/** Watermark configuration item */
export interface WatermarkConfig {
	TYPE: 'TEXT' | 'IMAGE';
	CONTENT: string | string[];
	LOCATION: 'BOTTOM_LEFT' | 'BOTTOM_RIGHT' | 'TOP_LEFT' | 'TOP_RIGHT';
	SIZE: string;
	FONT_FAMILY?: string;
	FONT_WEIGHT?: string;
	COLOR?: string;
	OPACITY: string;
	POSITION?: LabelPositionConfig;
}

/** Topbar title configuration */
export interface TopbarTitleConfig {
	TYPE: 'TEXT' | 'IMAGE' | 'HTML';
	CONTENT: string;
}

/** Topbar link configuration */
export interface TopbarLinkConfig {
	TITLE: string;
	URL: string;
}

/** Topbar configuration */
export interface TopbarConfig {
	TITLE: TopbarTitleConfig;
	LINK_LIST: TopbarLinkConfig[] | I18nConfigValue;
}

/** Description configuration item */
export interface DescriptionConfig {
	TYPE: 'TEXT' | 'HTML' | 'IMAGE';
	CONTENT: string;
}

/** Sample-set configuration */
export interface SamplesConfig {
	/** Site-wide default run count when a variant declares no sample set. */
	DEFAULT_COUNT?: number;
	/** Site-wide default display set when a sample set declares none. */
	DEFAULT_DISPLAY?: SampleDisplayMode[];
	/** Opacity of the deviation fill area (0-1) */
	FILL_OPACITY?: number;
}

/** @deprecated Read as a fallback for `SAMPLES.DEFAULT_DISPLAY`. */
export interface MultiSampleConfig {
	/** Default display mode: 'average' shows only averaged trace, 'all' shows all samples */
	DEFAULT_DISPLAY: 'average' | 'all';
}

/** @deprecated Read as a fallback for `SAMPLES.DEFAULT_DISPLAY` / `SAMPLES.FILL_OPACITY`. */
export interface HpTFConfig {
	/** Default display mode for HpTF items */
	DEFAULT_DISPLAY: 'fill' | 'fill+curves' | 'curves' | 'none';
	/** Opacity of the deviation fill area (0-1) */
	FILL_OPACITY: number;
}

/** Per-curve download button configuration */
export interface DownloadConfig {
	ENABLED: boolean;
}

/** Trace styling configuration */
export interface TraceStylingConfig {
	PHONE_TRACE_THICKNESS: number;
	TARGET_TRACE_THICKNESS: number;
	TARGET_TRACE_DASH: Array<{ name: string; dash: string }>;
}

/** Main application configuration (window.GRAPHTOOL_CONFIG) */
export interface AppConfig {
	SQUIGLINK?: import('./squiglink-types').SquiglinkConfig;
	INITIAL_PHONES: string[];
	INITIAL_TARGETS: string[];
	INITIAL_PANEL: 'phone' | 'graph' | 'misc';
	NORMALIZATION: NormalizationConfig;
	VISUALIZATION: VisualizationConfig;
	INTERFACE: InterfaceConfig;
	URL: URLConfig;
	RANKING_URL?: string;
	LANGUAGE: LanguageConfig;
	PATH: PathConfig;
	WATERMARK: WatermarkConfig[];
	TARGET_MANIFEST: TargetManifestEntry[] | I18nConfigValue;
	TRACE_STYLING: TraceStylingConfig;
	SAMPLES?: SamplesConfig;
	DOWNLOAD?: DownloadConfig;
	/** @deprecated superseded by SAMPLES */
	MULTI_SAMPLE?: MultiSampleConfig;
	/** @deprecated superseded by SAMPLES */
	HPTF?: HpTFConfig;
	TOPBAR: TopbarConfig;
	DESCRIPTION: DescriptionConfig[] | I18nConfigValue;
}
