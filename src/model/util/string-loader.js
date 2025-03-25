class StringLoader {
  constructor() {
    this._strings = new Map();
    this._cache = new Map();
    this._extensionStrings = new Map();
    this._langList = window.GRAPHTOOL_CONFIG?.LANGUAGE?.LANGUAGE_LIST || ["en", "English"], ["ko", "한국어"];
    this._currentLang = 'en';
    this._observers = new Set();
    this._fallbackChain = ['en'];
    this._boundObservers = new WeakMap();

    if(window.GRAPHTOOL_CONFIG?.LANGUAGE?.ENABLE_I18N) {
      if(window.GRAPHTOOL_CONFIG?.LANGUAGE?.ENABLE_SYSTEM_LANG_DETECTION) {
        this._currentLang = this._detectLanguage();
      }
    }

    this.loadLanguage(this._currentLang);
  }

  _detectLanguage() {
    const browserLang = navigator.language.split('-')[0];
    const langArray = this._langList.map(([lang, _]) => lang);
    // Check if browser language is in the list
    return langArray.includes(browserLang) ? browserLang : 'en';
  }

  static getInstance() {
    if (!StringLoader._instance) {
      StringLoader._instance = new StringLoader();
    }
    return StringLoader._instance;
  }

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

      // Notify observers
      this._notifyObservers();
      
      return true;
    } catch (error) {
      console.error('Failed to load language:', error);
      return false;
    } finally {
      document.documentElement.removeAttribute('data-loading');
    }
  }

  // Recursively process nested strings
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

  getCurrentLanguage() {
    return this._currentLang;
  }

  // Observer pattern for language changes
  addObserver(callback) {
    const boundCallback = callback.bind(this);
    this._boundObservers.set(callback, boundCallback);
    this._observers.add(boundCallback);
  }

  removeObserver(callback) {
    const boundCallback = this._boundObservers.get(callback);
    if (boundCallback) {
      this._observers.delete(boundCallback);
      this._boundObservers.delete(callback);
    }
  }

  _notifyObservers() {
    for (const callback of this._observers) {
      callback(this._currentLang);
    }
  }

  async loadExtensionStrings() {
    this.activeExtensionList = window.EXTENSION_CONFIG.filter((extension) => extension.I18N_ENABLED);
    
    // Use Promise.all to wait for all extensions to load
    await Promise.all(
      this.activeExtensionList.map(async (extension) => {
        try {
          const response = await fetch(import.meta.resolve(`./extension/${extension.NAME}/strings/${this._currentLang}.json`));
          if (!response.ok) throw new Error();
          
          const strings = await response.json();
          this._extensionStrings.set(extension.NAME, strings);
          this._processStrings(`extension.${extension.NAME}`, strings);
        } catch (error) {
          console.warn(`No strings found for extension: ${extension.NAME}`);
        }
      })
    );
  }
}

export default StringLoader.getInstance();