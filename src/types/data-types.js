/**
 * @fileoverview Type definitions for modernGraphTool data structures
 * This file contains JSDoc type definitions used throughout the application
 */

/**
 * Frequency response data point [frequency_hz, amplitude_db]
 * @typedef {[number, number]} FRDataPoint
 */

/**
 * Channel data containing frequency response measurements
 * @typedef {Object} ChannelData
 * @property {FRDataPoint[]} data - Array of frequency response data points
 * @property {Object} metadata - Channel metadata
 * @property {number[]} metadata.weights - Optional weighting values for each data point
 * @property {number} metadata.minFreq - Minimum frequency in the dataset
 * @property {number} metadata.maxFreq - Maximum frequency in the dataset
 */

/**
 * Raw frequency response data structure from parser
 * @typedef {Object} ParsedFRData
 * @property {ChannelData} [L] - Left channel data (for phones)
 * @property {ChannelData} [R] - Right channel data (for phones)
 * @property {ChannelData} [AVG] - Average channel data
 */

/**
 * File reference for phone measurements
 * @typedef {Object} PhoneFileReference
 * @property {string} L - Left channel filename
 * @property {string} R - Right channel filename
 */

/**
 * File variant for phones with multiple measurement variants
 * @typedef {Object} PhoneFileVariant
 * @property {string} suffix - Display suffix for this variant
 * @property {string} fullName - Full display name including suffix
 * @property {PhoneFileReference} files - File references for L/R channels
 * @property {string} fileName - Base filename
 */

/**
 * Raw phone data from phone_book.json before processing
 * @typedef {Object} RawPhoneData
 * @property {string|string[]} name - Phone model name(s)
 * @property {string|string[]} [file] - File name(s) for measurements
 * @property {string|string[]} [suffix] - Display suffix(es)
 * @property {string|string[]} [prefix] - File prefix(es) to remove
 * @property {number} [reviewScore] - Review score if available
 * @property {string} [reviewLink] - Review link if available
 * @property {string} [shopLink] - Shopping link if available
 * @property {string} [price] - Price information if available
 */

/**
 * Raw brand data from phone_book.json before processing
 * @typedef {Object} RawBrandData
 * @property {string} name - Brand name
 * @property {string} [suffix] - Brand suffix
 * @property {(string|RawPhoneData)[]} phones - Array of phone names or phone objects
 */

/**
 * Phone metadata from phone_book.json
 * @typedef {Object} PhoneMetadata
 * @property {string} brand - Brand name
 * @property {string} name - Phone model name
 * @property {string} identifier - Unique identifier (brand + name)
 * @property {PhoneFileVariant[]} files - Array of file variants
 * @property {number} [reviewScore] - Review score if available
 * @property {string} [reviewLink] - Review link if available
 * @property {string} [shopLink] - Shopping link if available
 * @property {string} [price] - Price information if available
 * @property {string} [dispSuffix] - Display suffix for search results
 * @property {*} [extensionData] - Additional data added by extensions
 */

/**
 * Target metadata structure
 * @typedef {Object} TargetMetadata
 * @property {string} identifier - Target identifier
 * @property {Array<{files: string}>} files - Array containing file reference
 * @property {*} [extensionData] - Additional data added by extensions
 */

/**
 * Brand metadata from phone_book.json
 * @typedef {Object} BrandMetadata
 * @property {string} brand - Brand name
 * @property {PhoneMetadata[]} phones - Array of phones for this brand
 */

/**
 * Target manifest entry from config
 * @typedef {Object} TargetManifestEntry
 * @property {string} type - Type of target
 * @property {string[]} files - Array of target file identifiers
 */

/**
 * Color scheme for frequency response traces
 * @typedef {Object} FRColors
 * @property {string} [L] - Left channel color (HSL format)
 * @property {string} [R] - Right channel color (HSL format)
 * @property {string} AVG - Average channel color (HSL format)
 */

/**
 * FR Data Type
 * @typedef {'phone'|'target'|'inserted-phone'|'inserted-target'} FRDataType
 */

/**
 * Complete frequency response data object stored in DataProvider
 * @typedef {Object} FRDataObject
 * @property {string} uuid - Unique identifier for this data object
 * @property {FRDataType} type - Type of FR data
 * @property {string} identifier - Display identifier
 * @property {ParsedFRData} channels - Channel data (L, R, AVG)
 * @property {('L'|'R'|'AVG')[]} dispChannel - Currently displayed channels
 * @property {string?} dispSuffix - Display suffix for variants
 * @property {FRColors} colors - Color scheme for traces
 * @property {string} dash - SVG dash pattern for traces
 * @property {PhoneMetadata|TargetMetadata} [meta] - Original metadata
 * @property {boolean} [hidden] - Whether the trace is hidden
 */

/**
 * Input metadata for adding FR data
 * @typedef {Object} FRInputMetadata
 * @property {string} [dispSuffix] - Display suffix for variants
 * @property {('L'|'R'|'AVG')[]} [dispChannel] - Channels to display
 */

/**
 * Event data for FR-related events
 * @typedef {Object} FREventData
 * @property {string} uuid - UUID of the FR data object
 * @property {string} identifier - Identifier of the FR data
 * @property {FRDataType} [type] - Type of FR data
 */

/**
 * Baseline data for graph compensation
 * @typedef {Object} BaselineData
 * @property {string|null} uuid - UUID of baseline FR data
 * @property {string|null} identifier - Identifier of baseline FR data
 * @property {FRDataPoint[]|null} channelData - Baseline frequency response data
 */

/**
 * Validation result for data parsing
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether the data is valid
 * @property {string[]} errors - Array of validation error messages
 * @property {string[]} warnings - Array of validation warning messages
 */

/**
 * Configuration for FR data processing
 * @typedef {Object} FRProcessingConfig
 * @property {boolean} enableSmoothing - Whether to apply smoothing
 * @property {number} smoothingFactor - Smoothing factor (0-1)
 * @property {boolean} enableNormalization - Whether to apply normalization
 * @property {number} normalizationFreq - Frequency for normalization (Hz)
 */

/**
 * Internationalized configuration value with language variants
 * @typedef {Object} I18nConfigValue
 * @property {any} default - Default value
 * @property {Object<string, any>} i18n - Language-specific values
 */

/**
 * Label position configuration
 * @typedef {Object} LabelPositionConfig
 * @property {string} LEFT - Left position offset
 * @property {string} RIGHT - Right position offset  
 * @property {string} UP - Up position offset
 * @property {string} DOWN - Down position offset
 */

/**
 * Label configuration
 * @typedef {Object} LabelConfig
 * @property {'BOTTOM_LEFT'|'BOTTOM_RIGHT'|'TOP_LEFT'|'TOP_RIGHT'} LOCATION - Label location
 * @property {LabelPositionConfig} POSITION - Fine-tune position
 * @property {string} TEXT_SIZE - Font size
 * @property {string} TEXT_WEIGHT - Font weight
 */

/**
 * Normalization configuration
 * @typedef {Object} NormalizationConfig
 * @property {'Hz'|'Avg'} TYPE - Normalization type
 * @property {number} HZ_VALUE - Frequency for Hz normalization
 */

/**
 * Visualization configuration
 * @typedef {Object} VisualizationConfig
 * @property {40|60|80|100} DEFAULT_Y_SCALE - Default Y-axis scale
 * @property {LabelConfig} LABEL - Phone & target label settings
 * @property {LabelConfig} BASELINE_LABEL - Baseline label settings
 * @property {string} RIG_DESCRIPTION - Measurement rig description
 */

/**
 * Target interface configuration
 * @typedef {Object} TargetInterfaceConfig
 * @property {boolean} ALLOW_MULTIPLE_LINE_PER_TYPE - Display targets in multiple lines
 * @property {boolean} OMIT_TARGET_SUFFIX - Omit 'target' suffix
 * @property {boolean} COLLAPSE_TARGET_LIST_ON_INITIAL - Collapse target list initially
 */

/**
 * Interface configuration
 * @typedef {Object} InterfaceConfig
 * @property {'light'|'dark'|'system'} PREFERRED_DARK_MODE_THEME - Theme preference
 * @property {boolean} ALLOW_REMOVING_PHONE_FROM_SELECTOR - Allow phone removal
 * @property {boolean} SWITCH_PHONE_PANEL_ON_BRAND_CLICK - Switch panels on brand click
 * @property {TargetInterfaceConfig} TARGET - Target-specific settings
 * @property {boolean} HIDE_DEV_DONATE_BUTTON - Hide donate button
 */

/**
 * URL configuration
 * @typedef {Object} URLConfig
 * @property {boolean} AUTO_UPDATE_URL - Auto-update URL on changes
 * @property {boolean} COMPRESS_URL - Compress URL with Base62
 */

/**
 * Language configuration
 * @typedef {Object} LanguageConfig
 * @property {[string, string][]} LANGUAGE_LIST - Available languages [code, name]
 * @property {boolean} ENABLE_I18N - Enable internationalization
 * @property {boolean} ENABLE_SYSTEM_LANG_DETECTION - Enable system language detection
 */

/**
 * Path configuration
 * @typedef {Object} PathConfig
 * @property {string} PHONE_MEASUREMENT - Phone measurement files path
 * @property {string} TARGET_MEASUREMENT - Target measurement files path
 * @property {string} PHONE_BOOK - Phone book JSON path
 */

/**
 * Watermark configuration item
 * @typedef {Object} WatermarkConfig
 * @property {'TEXT'|'IMAGE'} TYPE - Watermark type
 * @property {string|string[]} CONTENT - Content (text or image path(s))
 * @property {'BOTTOM_LEFT'|'BOTTOM_RIGHT'|'TOP_LEFT'|'TOP_RIGHT'} LOCATION - Location
 * @property {string} SIZE - Size specification
 * @property {string} [FONT_FAMILY] - Font family (for TEXT type)
 * @property {string} [FONT_WEIGHT] - Font weight (for TEXT type)
 * @property {string} [COLOR] - Text color (for TEXT type)
 * @property {string} OPACITY - Opacity value
 * @property {LabelPositionConfig} [POSITION] - Position fine-tuning
 */

/**
 * Topbar title configuration
 * @typedef {Object} TopbarTitleConfig
 * @property {'TEXT'|'IMAGE'|'HTML'} TYPE - Title type
 * @property {string} CONTENT - Title content
 */

/**
 * Topbar link configuration
 * @typedef {Object} TopbarLinkConfig
 * @property {string} TITLE - Link title
 * @property {string} URL - Link URL
 */

/**
 * Topbar configuration
 * @typedef {Object} TopbarConfig
 * @property {TopbarTitleConfig} TITLE - Title configuration
 * @property {TopbarLinkConfig[]|I18nConfigValue} LINK_LIST - Links list (with i18n support)
 */

/**
 * Description configuration item
 * @typedef {Object} DescriptionConfig
 * @property {'TEXT'|'HTML'|'IMAGE'} TYPE - Description type
 * @property {string} CONTENT - Description content
 */

/**
 * Trace styling configuration
 * @typedef {Object} TraceStylingConfig
 * @property {number} PHONE_TRACE_THICKNESS - Phone trace thickness
 * @property {number} TARGET_TRACE_THICKNESS - Target trace thickness
 * @property {Array<{name: string, dash: string}>} TARGET_TRACE_DASH - Target dash patterns
 */

/**
 * Main application configuration
 * @typedef {Object} AppConfig
 * @property {string[]} INITIAL_PHONES - Initial phones to load
 * @property {string[]} INITIAL_TARGETS - Initial targets to load
 * @property {'phone'|'graph'|'misc'} INITIAL_PANEL - Initial panel to display
 * @property {NormalizationConfig} NORMALIZATION - Normalization settings
 * @property {VisualizationConfig} VISUALIZATION - Visualization settings
 * @property {InterfaceConfig} INTERFACE - Interface settings
 * @property {URLConfig} URL - URL settings
 * @property {LanguageConfig} LANGUAGE - Language settings
 * @property {PathConfig} PATH - File path settings
 * @property {WatermarkConfig[]} WATERMARK - Watermark configurations
 * @property {TargetManifestEntry[]|I18nConfigValue} TARGET_MANIFEST - Target manifest
 * @property {TraceStylingConfig} TRACE_STYLING - Trace styling settings
 * @property {TopbarConfig} TOPBAR - Topbar configuration
 * @property {DescriptionConfig[]|I18nConfigValue} DESCRIPTION - Description content
 */

export {};
