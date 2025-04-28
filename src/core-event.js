import ConfigGetter from "./model/util/config-getter.js";

const CoreEvent = {
  initEventList: {
    "graph-ui-ready": false,
    "phone-ui-ready": false,
    "target-ui-ready": false,
    "url-loaded": false,
  },
  isMobile: window.innerWidth < 1000,

  init(coreAPI) {
    this.coreAPI = coreAPI;

    // Bind event handlers
    this._bindCoreInit();
    this._bindInterfaceInit();

    // Screen Resize Event Handler
    window.addEventListener("resize", this._updateUI.bind(this));
  },

  dispatchInitEvent(type) {
    if (this.initEventList[type]) {
      return;
    }
    this.initEventList[type] = true;

    // Check if all events have been dispatched
    if (Object.values(this.initEventList).every((value) => value)) {
      this.dispatchEvent("init-ready");
    }
  },

  // Event system
  dispatchEvent(type, detail) {
    const event = new CustomEvent(`core:${type}`, { detail });
    window.dispatchEvent(event);
  },

  // Core Event Handler
  _bindCoreInit() {
    window.addEventListener("DOMContentLoaded", async () => {
      // Switch to Mobile UI if applicable
      document.documentElement.toggleAttribute("data-mobile", this.isMobile);
      // Append Selection List
      this._appendSelectionList();
      // Update Theme 
      this._updateTheme();
      // Initialize URL Provider
      this.coreAPI.URLProvider.init(this);
      // Fetch Phone Book Data
      await this.coreAPI.MetadataParser.init(this);
      // Initialize Data Provider
      this.coreAPI.DataProvider.init(this);
    });
  },

  // Render-Ready Event Handler
  _bindInterfaceInit() {
    window.addEventListener("core:init-ready", async () => {
      // Initialize Menu Panel UI
      this.coreAPI.MenuState.init(this);
      // Initialize d3 Render Engine
      this.coreAPI.RenderEngine.init(this, this.coreAPI.DataProvider);
      // Add Initial Data
      this._addInitialData();
      // Initialize extension
      this.coreAPI.CoreExtension.init();
      // Dispatch ready event
      this.dispatchEvent("ready");
    });
  },

  _appendSelectionList() {
    // Create the single instance of selection-list and move it
    this.selectionListInstance = document.createElement('selection-list');

    const desktopContainer = document.querySelector('.main-graph-list');
    const mobilePanel = document.querySelector('list-panel');
    const mobileContainer = mobilePanel?.contentContainer; // Use the getter

    if (this.isMobile) {
      // Move to mobile container (inside list-panel)
      if (mobileContainer) {
        mobileContainer.appendChild(this.selectionListInstance);
        desktopContainer.style.display = 'none'; // Hide the desktop container
      } else {
        console.warn('Mobile container (list-panel) not found for selection list.');
        // Fallback or error handling: maybe append somewhere else or hide it
        desktopContainer.style.display = 'none';
      }
    } else {
      // Move to desktop container
      desktopContainer.style.display = 'block'; // Ensure desktop container is visible
      desktopContainer.appendChild(this.selectionListInstance);
      // Optionally hide or clear the mobile container if needed
    }
  },

  _updateUI() {
    // Update UI Mode (Mobile / Desktop)
    if(this.isMobile !== (window.innerWidth < 1000)) {
      this.isMobile = !this.isMobile;
      document.documentElement.toggleAttribute("data-mobile",this.isMobile);
      // Dispatch UI Mode Change Event
      this.dispatchEvent("ui-mode-change", {isMobile: this.isMobile});
      // Re-append Selection List
      this._appendSelectionList();
    }
  },

  _updateTheme() {
    var darkmode =
      ConfigGetter.get('INTERFACE.PREFERRED_DARK_MODE_THEME')?.toLowerCase() ||
      "system";
    if (darkmode === "system") {
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? (darkmode = "dark")
        : (darkmode = "light");
    }
    document.documentElement.setAttribute("data-theme", darkmode);
  },

  _addInitialData() {
    // List of phones fetched from URL Data
    const phones = this.coreAPI.URLProvider.getPhoneDataFromURL();

    if (phones !== null) {
      Array.from(phones).forEach(async (phone) => {
        try {
          const matchingPhone = this.coreAPI.MetadataParser.searchFRInfoWithFullName(phone);
          await this.coreAPI.DataProvider.addFRData("phone", matchingPhone.identifier, {
            dispSuffix: matchingPhone.dispSuffix,
          });
        } catch (e) {
          if (this.coreAPI.MetadataParser.isTargetAvailable(phone)) {
            await this.coreAPI.DataProvider.addFRData("target", phone);
          }
        }
      });
    } else {
      // Add Initial Phones
      const initialPhones = ConfigGetter.get('INITIAL_PHONES') || [];
      initialPhones.forEach(async (phone) => {
        const matchingPhone = this.coreAPI.MetadataParser.searchFRInfoWithFullName(phone);
        await this.coreAPI.DataProvider.addFRData("phone", matchingPhone.identifier, {
          dispSuffix: matchingPhone.dispSuffix,
        });
      });
      // Add Initial Targets
      const initialTargets = ConfigGetter.get('INITIAL_TARGETS') || [];
      initialTargets.forEach(async (target) => {
        if (this.coreAPI.MetadataParser.isTargetAvailable(target)) {
          await this.coreAPI.DataProvider.addFRData("target", target);
        }
      });
    }
  },
};

export default CoreEvent;
