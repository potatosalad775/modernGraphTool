import StringLoader from './string-loader.js';

class ConfigGetter {
  constructor() {
    this._config = window.GRAPHTOOL_CONFIG;
    this._cache = new Map();
    
    // Subscribe to language changes
    StringLoader.addObserver(() => {
      // Clear cache when language changes
      this._cache.clear();
    });
  }

  static getInstance() {
    if (!ConfigGetter._instance) {
      ConfigGetter._instance = new ConfigGetter();
    }
    return ConfigGetter._instance;
  }

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

  getDefault(path) {
    const value = this._getValueByPath(path);
    if (!value) return null;

    return value.default || value;
  }

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

  _getValueByPath(path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], this._config);
  }
}

export default ConfigGetter.getInstance();