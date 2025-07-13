import Base62 from "./util/base62.js";
import DataProvider from "./data-provider.js";
import ConfigGetter from "./util/config-getter.js";

class URLProvider {
  constructor() {
    this.baseTitle = document.querySelector('title')?.textContent || "modernGraphTool";
    this.baseDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || "View and compare frequency response graphs";
    this.baseURL = window.location.href.split("?")[0];
    this.autoUpdateURL = ConfigGetter.get('URL.AUTO_UPDATE_URL') || true;
    this.useBase62 = ConfigGetter.get('URL.COMPRESS_URL') || false; // Toggle for URL shortening
    this.currentURL = "";
    this.phoneDataFromURL = null;

    // Bind methods
    this._handlePhoneChange = this._handlePhoneChange.bind(this);
  }

  init(coreEvent) {
    this.coreEvent = coreEvent;
    // Initialize
    this._setupEventListeners();
    this._loadFromURL();
  }

  _setupEventListeners() {
    // Listen for phone add/remove events
    window.addEventListener("core:fr-phone-added", this._handlePhoneChange);
    window.addEventListener("core:fr-phone-removed", this._handlePhoneChange);
    window.addEventListener("core:fr-target-added", this._handlePhoneChange);
    window.addEventListener("core:fr-target-removed", this._handlePhoneChange);
  }

  _handlePhoneChange(event) {
    this.updateURL(this.autoUpdateURL);
  }

  async _loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get("share");

    let phoneList = null;

    if (shareParam) {
      if (shareParam.startsWith("b62_")) {
        // Decode Base62 string
        const encoded = shareParam.replace("b62_", "");
        phoneList = this._smartSplit(Base62.decode(encoded));
      } else {
        const decodedParam = decodeURI(shareParam).replace(/_/g, " ");
        phoneList = this._smartSplit(decodedParam);
      }
    };

    // Update URL Data
    this.phoneDataFromURL = phoneList;

    // Dispatch event to load phones
    if(this.coreEvent) {
      this.coreEvent.dispatchInitEvent("url-loaded");
    }
  }

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

  // Public method to toggle Base62 encoding
  toggleBase62(enable) {
    this.useBase62 = enable;
    this.updateURL();
  }

  // Public method to get phone data from URL
  getPhoneDataFromURL() {
    return this.phoneDataFromURL;
  }

  // Public method to get URL with current data
  getCurrentURL() {
    return this.currentURL;
  }
}

export default new URLProvider();
