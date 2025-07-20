import Base62 from "./util/base62.js";
import DataProvider from "./data-provider.js";
import ConfigGetter from "./util/config-getter.js";

/**
 * URL Provider for managing application URLs and metadata
 * Handles URL updates, phone data extraction, and metadata management
 */
class URLProvider {
  constructor() {
    /** @type {string} Base title for the application */
    this.baseTitle = document.querySelector('title')?.textContent || "modernGraphTool";
    /** @type {string} Base description for the application */
    this.baseDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || "View and compare frequency response graphs";
    /** @type {string} Base URL without query parameters */
    this.baseURL = window.location.href.split("?")[0];
    /** @type {boolean} Whether to automatically update URL on phone changes */
    this.autoUpdateURL = ConfigGetter.get('URL.AUTO_UPDATE_URL') || true;
    /** @type {boolean} Whether to use Base62 encoding for URLs */
    this.useBase62 = ConfigGetter.get('URL.COMPRESS_URL') || false; // Toggle for URL shortening
    /** @type {string} Current URL being managed */
    this.currentURL = "";
    /** @type {Array<string>} Phone data extracted from URL */
    this.phoneDataFromURL = [];

    // Bind methods
    this._handlePhoneChange = this._handlePhoneChange.bind(this);
  }

  /**
   * Initialize URLProvider with core event
   * @param {import('../core-event.js').default} coreEvent - Core event instance to manage URL updates
   */
  init(coreEvent) {
    this.coreEvent = coreEvent;
    // Initialize
    this._setupEventListeners();
    this._loadFromURL();
  }

  /**
   * Setup event listeners for phone changes
   * This will update the URL when phones are added or removed
   * @private
   */
  _setupEventListeners() {
    // Listen for phone add/remove events
    window.addEventListener("core:fr-phone-added", this._handlePhoneChange);
    window.addEventListener("core:fr-phone-removed", this._handlePhoneChange);
    window.addEventListener("core:fr-target-added", this._handlePhoneChange);
    window.addEventListener("core:fr-target-removed", this._handlePhoneChange);
    window.addEventListener("core:fr-variant-updated", this._handlePhoneChange);
    window.addEventListener("core:fr-visibility-updated", this._handlePhoneChange);
  }

  /**
   * Handle phone change events to update URL
   * @private
   */
  _handlePhoneChange() {
    this.updateURL(this.autoUpdateURL);
  }

  /**
   * Load phone data from URL parameters
   * This will parse the 'share' parameter and extract phone names
   * @returns {Promise<void>}
   * @private
   */
  async _loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get("share");

    if (shareParam) {
      if (shareParam.startsWith("b62_")) {
        // Decode Base62 string
        const encoded = shareParam.replace("b62_", "");
        this.phoneDataFromURL = this._smartSplit(Base62.decode(encoded));
      } else {
        const decodedParam = decodeURI(shareParam).replace(/_/g, " ");
        this.phoneDataFromURL = this._smartSplit(decodedParam);
      }
    };

    // Dispatch event to load phones
    if(this.coreEvent) {
      this.coreEvent.dispatchInitEvent("url-loaded");
    }
  }

  /**
   * Smartly split a string by commas, respecting parentheses
   * @param {string} input - Input string to split
   * @returns {Array<string>} Array of split strings
   * @private
   */
  _smartSplit(input) {
    const result = [];
    let current = "";
    let parenDepth = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      
      if (char === '(' || char === '[' || char === '{') {
        parenDepth++;
        current += char;
      } else if (char === ')' || char === ']' || char === '}') {
        parenDepth--;
        current += char;
      } else if (char === ',' && parenDepth === 0) {
        // Split here - comma is outside parentheses
        if (current.trim()) {
          result.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    }

    // Add the last part
    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * Update the URL based on current phone data
   * This will encode phone names and update the URL and title
   * @param {boolean} changeURL - Whether to actually change the URL in the browser
   */
  updateURL(changeURL = true) {
    // Get active phones from DataProvider
    const activePhones = Array.from(DataProvider.frDataMap)
      .map(([_, el]) => (el.identifier + ' ' + el.dispSuffix).trim())
      .filter((name) => name); // Filter out empty values

    let title = this.baseTitle;
    let url = this.baseURL;
    const namesCombined = activePhones.join(", ");

    if (activePhones.length) {
      if (this.useBase62) {
        // Encode phone list to Base62
        const encoded = Base62.encode(activePhones.join(","));
        url += `?share=b62_${encoded}`;
      } else {
        url += `?share=${encodeURI(activePhones.join(",").replace(/ /g, " "))}`;
      }
      title = title + " - " + namesCombined;
    }

    if(changeURL) {
      // Update URL and title
      window.history.replaceState("", title, url);
      this.currentURL = url;
    }
    document.title = title;

    // Update meta tags
    this._updateMetaTags(namesCombined);
  }

  /**
   * Update meta tags based on current phone data
   * This will update the canonical link and description meta tag
   * @param {string} namesCombined - Combined names of active phones
   * @private
   */
  _updateMetaTags(namesCombined) {
    // Update canonical link
    const canonicalLink = document.querySelector("link[rel='canonical']");
    if (canonicalLink) {
      canonicalLink.setAttribute(
        "href",
        namesCombined ? window.location.href : this.baseURL
      );
    }

    // Update description
    const metaDescription = document.querySelector("meta[name='description']");
    if (metaDescription && namesCombined) {
      metaDescription.setAttribute(
        "content",
        `View and compare frequency response graph of ${namesCombined}.`
      );
    }
  }

  /**
   * Toggle Base62 encoding for URLs
   * @param {boolean} enable - Whether to enable Base62 encoding
   */
  toggleBase62(enable) {
    this.useBase62 = enable;
    this.updateURL();
  }

  /**
   * Public method to get phone data from URL
   * @returns {Array<string>} - Array of phone data
   */
  getPhoneDataFromURL() {
    return this.phoneDataFromURL;
  }

  /**
   * Public method to get URL with current data
   * @returns {string} - Current URL
   */
  getCurrentURL() {
    return this.currentURL;
  }
}

export default new URLProvider();
