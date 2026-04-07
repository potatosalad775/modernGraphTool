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

/** A single measurement sample containing L and R channels */
export interface SampleData {
  L?: ChannelData;
  R?: ChannelData;
}

/** Display channel key for multi-sample mode */
export type SampleChannelKey = 'L' | 'R' | 'AVG' | `L${number}` | `R${number}`;

// ── HpTF (Headphone Transfer Function) ──────────────────────────────────────

/** Single HpTF measurement sample */
export interface HpTFSampleData {
  label: string;
  L?: ChannelData;
  R?: ChannelData;
  AVG?: ChannelData;
}

/** Min/max envelope computed across all HpTF samples */
export interface HpTFEnvelope {
  upper: FRDataPoint[];
  lower: FRDataPoint[];
}

/** Complete HpTF data attached to an FRDataObject */
export interface HpTFData {
  samples: HpTFSampleData[];
  envelope: Record<'L' | 'R' | 'AVG', HpTFEnvelope>;
  labels: string[];
  /** When true, only the fill envelope is shown — no individual sample curve toggles. Default: true. */
  fillOnly: boolean;
}

/** Display key for HpTF sample curves, e.g. "sample0_AVG", "sample1_L" */
export type HpTFDisplayKey = `sample${number}_${'L' | 'R' | 'AVG'}`;

/** Color scheme for frequency response traces */
export interface FRColors {
  L?: string;
  R?: string;
  AVG: string;
  /** Colors for individual sample traces, keyed by SampleChannelKey like 'L1', 'R2' */
  samples?: Record<string, string>;
  /** Color for the HpTF deviation fill area */
  hptfStroke?: string;
  hptfFill?: string;
}

/** FR data type discriminant */
export type FRDataType = 'phone' | 'target' | 'eq' | 'inserted-phone' | 'inserted-target' | 'inserted-eq';

/** Complete frequency response data object stored in DataProvider */
export interface FRDataObject {
  uuid: string;
  type: FRDataType;
  identifier: string;
  channels: ParsedFRData;
  dispChannel: ('L' | 'R' | 'AVG')[];
  dispSuffix?: string | null;
  colors: FRColors;
  dash: string;
  meta?: PhoneMetadata | TargetMetadata;
  hidden?: boolean;
  yOffset?: number;
  /** Multi-sample data. If present, `channels` holds the computed averages. */
  samples?: SampleData[];
  /** Which sample traces to display (independent of dispChannel). */
  dispSamples?: SampleChannelKey[];
  /** Number of samples (derived from samples.length). */
  sampleCount?: number;
  /** HpTF deviation data. If present, deviation fill can be rendered. */
  hptf?: HpTFData;
  /** Which individual HpTF sample curves to display. */
  dispHptf?: HpTFDisplayKey[];
  /** Whether the HpTF deviation fill area is visible. */
  hptfFillVisible?: boolean;
  /** Whether the HpTF average curve (mean of all samples) is visible. */
  hptfAvgVisible?: boolean;
  /** When true, main channels are not drawn (HpTF-only mode, no file field in phone_book). */
  hptfOnly?: boolean;
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
}

/** File variant for phones with multiple measurement variants */
export interface PhoneFileVariant {
  suffix: string;
  fullName: string;
  files: PhoneFileReference;
  fileName: string;
  /** Per-sample file references for multi-sample measurements */
  sampleFiles?: PhoneFileReference[];
  /** Number of samples for this variant */
  sampleCount?: number;
  /** HpTF sample file references */
  hptfFiles?: PhoneFileReference[];
  /** Human-readable labels for each HpTF sample */
  hptfLabels?: string[];
  /** True when file was omitted — main curve should not render */
  hptfOnly?: boolean;
  /** When true, only fill envelope is shown — no individual sample curve toggles. Default: true. */
  hptfFillOnly?: boolean;
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
  description?: string;
  /** Number of measurement samples (e.g. 3 for L1/L2/L3/R1/R2/R3 files) */
  samples?: number;
  /** HpTF deviation configuration */
  hptf?: { files: string[]; labels?: string[]; fillOnly?: boolean };
}

/** Raw brand data from phone_book.json before processing */
export interface RawBrandData {
  name: string;
  suffix?: string;
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
  description?: string;
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

/** Multi-sample configuration */
export interface MultiSampleConfig {
  /** Default display mode: 'average' shows only averaged trace, 'all' shows all samples */
  DEFAULT_DISPLAY: 'average' | 'all';
}

/** HpTF (Headphone Transfer Function) configuration */
export interface HpTFConfig {
  /** Default display mode for HpTF items */
  DEFAULT_DISPLAY: 'fill' | 'fill+curves' | 'curves' | 'none';
  /** Opacity of the deviation fill area (0-1) */
  FILL_OPACITY: number;
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
  LANGUAGE: LanguageConfig;
  PATH: PathConfig;
  WATERMARK: WatermarkConfig[];
  TARGET_MANIFEST: TargetManifestEntry[] | I18nConfigValue;
  TRACE_STYLING: TraceStylingConfig;
  MULTI_SAMPLE?: MultiSampleConfig;
  HPTF?: HpTFConfig;
  TOPBAR: TopbarConfig;
  DESCRIPTION: DescriptionConfig[] | I18nConfigValue;
}
