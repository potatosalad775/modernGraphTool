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

/** Color scheme for frequency response traces */
export interface FRColors {
  L?: string;
  R?: string;
  AVG: string;
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
  reviewScore?: number;
  reviewLink?: string;
  shopLink?: string;
  price?: string;
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
  DEFAULT_Y_SCALE: 40 | 60 | 80 | 100;
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
  TOPBAR: TopbarConfig;
  DESCRIPTION: DescriptionConfig[] | I18nConfigValue;
}
