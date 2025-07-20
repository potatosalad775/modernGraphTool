/**
 * StringLoader class for managing language strings in the application.
 * It supports loading strings from JSON files, caching them, and processing them for internationalization.
 * It also supports observing language changes and loading extension strings.
 */
class StringLoader {
  constructor() {
    /** @type {Map<string, string>} */
    this._strings = new Map();
    /** @type {Map<string, Map<string, string>>} */
    this._cache = new Map();
    /** @type {Map<string, string>} */
    this._extensionStrings = new Map();
    /** @type {Array<[string, string]>} */
    this._langList = /** @type {any} */(window).GRAPHTOOL_CONFIG?.LANGUAGE?.LANGUAGE_LIST || [["en", "English"], ["ko", "한국어"]];
    /** @type {string} */
    this._currentLang = 'en';
    /** @type {Set<Function>} */
    this._observers = new Set();
    /** @type {string[]} */
    this._fallbackChain = ['en'];
    /** @type {WeakMap<Function, Function>} */
    this._boundObservers = new WeakMap();
    /** @type {Array<{NAME: string, I18N_ENABLED: boolean}>} */
    this._activeExtensionList = [];

    if(/** @type {any} */(window).GRAPHTOOL_CONFIG?.LANGUAGE?.ENABLE_I18N) {
      if(/** @type {any} */(window).GRAPHTOOL_CONFIG?.LANGUAGE?.ENABLE_SYSTEM_LANG_DETECTION) {
        this._currentLang = this._detectLanguage();
      }
    }

    this.loadLanguage(this._currentLang);
  }

  /**
   * Detect the browser language and return it if supported
   * @returns {string} Detected language code
   * @private
   */
  _detectLanguage() {
    const browserLang = navigator.language.split('-')[0];
    const langArray = this._langList.map(([lang, _]) => lang);
    // Check if browser language is in the list
    return langArray.includes(browserLang) ? browserLang : 'en';
  }

  /**
   * Get the list of available languages
   * @returns {Array<[string, string]>} List of language codes and names
   */
  getLanguageList() {
    return this._langList;
  }

  /**
   * Load a specific language
   * @param {string} lang - Language code to load
   * @param {boolean} force - Whether to force reload the language
   * @returns {Promise<boolean>} Promise resolving to true if language loaded successfully
   */
  async loadLanguage(lang, force = false) {
    try {
      // Show loading indicator
      document.documentElement.setAttribute('data-loading', '');

      // Use cached version if available and not forced
      if (!force && this._cache.has(lang)) {
        this._strings = new Map(this._cache.get(lang));
        this._currentLang = lang;
        // Wait for extension strings
        await this.loadExtensionStrings(); 
        // Notify observers
        this._notifyObservers();
        return true;
      }

      const response = await fetch(import.meta.resolve(`./assets/strings/${lang}.json`));
      if (!response.ok) throw new Error(`Language ${lang} not found`);
      
      const strings = await response.json();
      this._strings.clear();
      this._processStrings('', strings);
      
      // Cache the new strings
      this._cache.set(lang, new Map(this._strings));
      this._currentLang = lang;

      // Wait for extension strings
      await this.loadExtensionStrings(); 

      // Notify observers after all strings are loaded
      this._notifyObservers();
      
      return true;
    } catch (error) {
      console.error('Failed to load language:', error);
      return false;
    } finally {
      document.documentElement.removeAttribute('data-loading');
    }
  }

  /**
   * Recursively process nested strings
   * @param {string} prefix - Current prefix for the key
   * @param {object} obj - Object containing strings to process
   * @private
   */
  _processStrings(prefix, obj) {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        this._processStrings(fullKey, value);
      } else {
        this._strings.set(fullKey, value);
      }
    }
  }

  /**
   * Get a string by its key, with support for language-specific values
   * @param {string} key - Key of the string to retrieve
   * @param {string} [defaultValue] - Default value to return if the key is not found
   * @returns {string} The string value for the given key, or the default value if not found
   */
  getString(key, defaultValue = key) {
    // Try current language
    let value = this._strings.get(key);
    if (value) return value;

    // Try fallback chain
    for (const lang of this._fallbackChain) {
      if (lang === this._currentLang) continue;
      value = this._cache.get(lang)?.get(key);
      if (value) return value;
    }

    return defaultValue;
  }

  /**
   * Get current language code
   * @returns {string} Current language code
   */
  getCurrentLanguage() {
    return this._currentLang;
  }

  /**
   * Add an observer for language changes
   * @param {Function} callback - Callback function to be called on language change
   */
  addObserver(callback) {
    const boundCallback = callback.bind(this);
    this._boundObservers.set(callback, boundCallback);
    this._observers.add(boundCallback);
  }

  /**
   * Remove an observer for language changes
   * @param {Function} callback - Callback function to remove
   */
  removeObserver(callback) {
    const boundCallback = this._boundObservers.get(callback);
    if (boundCallback) {
      this._observers.delete(boundCallback);
      this._boundObservers.delete(callback);
    }
  }

  /**
   * Notify all observers about the language change
   * @private
   */
  _notifyObservers() {
    for (const callback of this._observers) {
      callback(this._currentLang);
    }
  }

  /**
   * Load strings for all active extensions
   * This method fetches strings from each extension's strings directory based on the current language.
   * It uses Promise.all to ensure all extensions are loaded before notifying observers.
   * @returns {Promise<void>}
   */
  async loadExtensionStrings() {
    this._activeExtensionList = await this.updateActiveExtensionList();
    
    // Use Promise.all to wait for all extensions to load
    await Promise.all(
      this._activeExtensionList.map(async (extension) => {
        try {
          const response = await fetch(`./extensions/${extension.NAME}/strings/${this._currentLang}.json`);
          if (!response.ok) throw new Error();
          
          const strings = await response.json();
          this._extensionStrings.set(extension.NAME, strings);
          this._processStrings(`extension.${extension.NAME}`, strings);
        } catch (error) {
          console.warn(`No strings found for extension: ${extension.NAME}`);
        }
      })
    );

    // Add a small delay and notify observers again after extension strings are fully loaded
    // This ensures components get updated with extension strings
    setTimeout(() => {
      this._notifyObservers();
    }, 100);
  }

  /**
   * Update the list of active extensions based on their configuration
   * This method dynamically loads the extension configuration and filters out inactive extensions.
   * @returns {Promise<Array<{NAME: string, I18N_ENABLED: boolean}>>} List of active extensions with I18N support
   */
  async updateActiveExtensionList() {
    try {
      const { EXTENSION_CONFIG } = await import(import.meta.resolve('./extensions/extensions.config.js'));
      return EXTENSION_CONFIG.filter((/** @type any */ extension) => extension.I18N_ENABLED);
    } catch (error) {
      console.error('modernGraphTool: Failed to load extension configuration -', error);
      return [];
    }
  }

  /**
   * Get singleton instance of StringLoader
   * @returns {StringLoader} Singleton instance
   */
  static getInstance() {
    if (!StringLoader._instance) {
      StringLoader._instance = new StringLoader();
    }
    return StringLoader._instance;
  }
}

/** @type {StringLoader|null} */
StringLoader._instance = null;

export default StringLoader.getInstance();