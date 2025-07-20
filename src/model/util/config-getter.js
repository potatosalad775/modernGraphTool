import StringLoader from './string-loader.js';

/**
 * @typedef {import('../../types/data-types.js').AppConfig} AppConfig
 * @typedef {import('../../types/data-types.js').I18nConfigValue} I18nConfigValue
 * @typedef {import('../../types/data-types.js').TargetManifestEntry} TargetManifestEntry
 */

/**
 * Configuration getter with internationalization support
 * Handles retrieval and processing of configuration values with language variants
 */
class ConfigGetter {
  constructor() {
    /** @type {AppConfig} */
    this._config = /** @type {any} */(window).GRAPHTOOL_CONFIG;
    
    /** @type {Map<string, any>} */
    this._cache = new Map();
    
    // Subscribe to language changes
    StringLoader.addObserver(() => {
      // Clear cache when language changes
      this._cache.clear();
    });
  }

  /**
   * Get singleton instance
   * @returns {ConfigGetter}
   */
  static getInstance() {
    if (!ConfigGetter._instance) {
      ConfigGetter._instance = new ConfigGetter();
    }
    return ConfigGetter._instance;
  }

  /**
   * Get configuration value by path with internationalization support
   * @param {string} path - Dot-separated path to the configuration value
   * @returns {any} Configuration value (processed for current language)
   */
  get(path) {
    // Check cache first
    const cacheKey = `${StringLoader.getCurrentLanguage()}:${path}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    const value = this._getValueByPath(path);
    if (!value) return null;

    // Process and cache the value
    const processedValue = this._processValue(value);
    this._cache.set(cacheKey, processedValue);
    return processedValue;
  }

  /**
   * Process configuration value for internationalization
   * @param {any} value - Raw configuration value
   * @returns {any} Processed value for current language
   * @private
   */
  _processValue(value) {
    // Check if the value has language variants
    if (value && typeof value === 'object' && value.i18n) {
      const lang = StringLoader.getCurrentLanguage();
      const baseValue = value.i18n.en || value.default;
      const langValue = value.i18n[lang];

      if (!langValue) return baseValue;

      if (Array.isArray(baseValue)) {
        return baseValue.map((item, index) => {
          const langItem = langValue[index];
          if (!langItem) return item;
          return this._mergeWithSharedValues(item, langItem);
        });
      }

      if (typeof baseValue === 'object') {
        return { ...baseValue, ...langValue };
      }

      if (typeof baseValue === 'string') {
        if (baseValue.toLowerCase() === 'true') {
          return true;
        } else if (baseValue.toLowerCase() === 'false') {
          return false;
        }
      }

      return langValue;
    }

    return value;
  }

  /**
   * Get default configuration value (without language processing)
   * @param {string} path - Dot-separated path to the configuration value
   * @returns {any} Default configuration value
   */
  getDefault(path) {
    const value = this._getValueByPath(path);
    if (!value) return null;

    return value.default || value;
  }

  /**
   * Merge base configuration item with language-specific values
   * @param {any} baseItem - Base configuration item
   * @param {any} langItem - Language-specific configuration item
   * @returns {any} Merged configuration item
   * @private
   */
  _mergeWithSharedValues(baseItem, langItem) {
    if (typeof baseItem !== 'object' || typeof langItem !== 'object') {
      return langItem || baseItem;
    }

    const result = { ...baseItem };
    
    // Copy language-specific properties
    for (const [key, value] of Object.entries(langItem)) {
      // If the value is an array, keep the base array
      if (Array.isArray(value) && Array.isArray(baseItem[key])) {
        result[key] = baseItem[key];
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Get a value by path from the config
   * @param {string} path - Dot-separated path to the value
   * @returns {any} Value at the specified path
   * @private
   */
  _getValueByPath(path) {
    return path.split('.').reduce((obj, key) => {
      return obj && typeof obj === 'object' ? 
        /** @type {any} */(obj)[key] : undefined;
    }, this._config);
  }

  /**
   * Check if a configuration path exists
   * @param {string} path - Dot-separated path to check
   * @returns {boolean} Whether the path exists
   */
  has(path) {
    return this._getValueByPath(path) !== undefined;
  }

  /**
   * Get all available language codes from LANGUAGE.LANGUAGE_LIST
   * @returns {string[]} Array of language codes
   */
  getAvailableLanguages() {
    const languageList = this.get('LANGUAGE.LANGUAGE_LIST');
    if (!Array.isArray(languageList)) {
      return ['en']; // fallback
    }
    return languageList.map(([code]) => code);
  }

  /**
   * Get target manifest entries for current language
   * @returns {TargetManifestEntry[]} Target manifest entries
   */
  getTargetManifest() {
    const manifest = this.get('TARGET_MANIFEST');
    if (!manifest) return [];
    
    // Ensure it returns array format
    if (Array.isArray(manifest)) {
      return manifest;
    }
    
    // Handle object format with default/i18n structure
    if (manifest.default && Array.isArray(manifest.default)) {
      return manifest.default;
    }
    
    return [];
  }

  /**
   * Get watermark configuration with random selection support
   * @returns {any} Processed watermark configuration
   */
  getWatermarkConfig() {
    const watermarks = this.get('WATERMARK');
    if (!Array.isArray(watermarks)) return null;
    
    return watermarks.map(watermark => {
      // Handle random content selection for arrays
      if (Array.isArray(watermark.CONTENT)) {
        const randomIndex = Math.floor(Math.random() * watermark.CONTENT.length);
        return {
          ...watermark,
          CONTENT: watermark.CONTENT[randomIndex]
        };
      }
      return watermark;
    });
  }

  /**
   * Validate configuration structure
   * @returns {{isValid: boolean, errors: string[]}} Validation result
   */
  validateConfig() {
    const errors = [];
    
    // Check required top-level properties
    const requiredProps = ['INITIAL_PHONES', 'INITIAL_TARGETS', 'PATH', 'VISUALIZATION'];
    for (const prop of requiredProps) {
      if (!this.has(prop)) {
        errors.push(`Missing required configuration property: ${prop}`);
      }
    }
    
    // Validate PATH configuration
    const pathConfig = this.get('PATH');
    if (pathConfig) {
      const requiredPaths = ['PHONE_MEASUREMENT', 'TARGET_MEASUREMENT', 'PHONE_BOOK'];
      for (const path of requiredPaths) {
        if (!pathConfig[path]) {
          errors.push(`Missing required path configuration: PATH.${path}`);
        }
      }
    }
    
    // Validate LANGUAGE configuration if i18n is enabled
    if (this.get('LANGUAGE.ENABLE_I18N')) {
      const languageList = this.get('LANGUAGE.LANGUAGE_LIST');
      if (!Array.isArray(languageList) || languageList.length === 0) {
        errors.push('LANGUAGE.LANGUAGE_LIST must be a non-empty array when i18n is enabled');
      }
    }
    
    // Validate Y scale options
    const yScale = this.get('VISUALIZATION.DEFAULT_Y_SCALE');
    if (yScale && ![40, 60, 80, 100].includes(yScale)) {
      errors.push('VISUALIZATION.DEFAULT_Y_SCALE must be one of: 40, 60, 80, 100');
    }
    
    // Validate normalization type
    const normType = this.get('NORMALIZATION.TYPE');
    if (normType && !['Hz', 'Avg'].includes(normType)) {
      errors.push('NORMALIZATION.TYPE must be either "Hz" or "Avg"');
    }
    
    // Validate theme setting
    const theme = this.get('INTERFACE.PREFERRED_DARK_MODE_THEME');
    if (theme && !['light', 'dark', 'system'].includes(theme)) {
      errors.push('INTERFACE.PREFERRED_DARK_MODE_THEME must be one of: "light", "dark", "system"');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration type information for development/debugging
   * @param {string} path - Configuration path to analyze
   * @returns {{type: string, hasI18n: boolean, value: any, rawValue: any}} Type information
   */
  getTypeInfo(path) {
    const value = this._getValueByPath(path);
    
    return {
      type: Array.isArray(value) ? 'array' : typeof value,
      hasI18n: value && typeof value === 'object' && 'i18n' in value,
      value: this.get(path),
      rawValue: value
    };
  }

  /**
   * Clear configuration cache
   * @returns {void}
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {{size: number, keys: string[]}} Cache statistics
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      keys: Array.from(this._cache.keys())
    };
  }
}

/** @type {ConfigGetter|null} */
ConfigGetter._instance = null;

export default ConfigGetter.getInstance();