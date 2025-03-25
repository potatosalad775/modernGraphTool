const CoreEvent = {
  initEventList: {
    "graph-ui-ready": false,
    "phone-ui-ready": false,
    "target-ui-ready": false,
    "url-loaded": false,
  },

  init(coreAPI) {
    this.coreAPI = coreAPI;

    // Bind event handlers
    this._bindCoreInit();
    this._bindInterfaceInit();

    // Screen Resize Event Handler
    window.addEventListener("resize", () => {
      this._setupUI();
    });
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
      // Initialize URL Provider
      this.coreAPI.URLProvider.init(this);
      // Fetch Phone Book Data
      await this.coreAPI.MetadataParser.init(this);
      // Initialize Data Provider
      this.coreAPI.DataProvider.init(this);
      // Switch to Mobile UI if applicable
      this._setupUI({ updateTheme: true });
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

  _setupUI(updateTheme = false) {
    const isMobile = window.innerWidth < 1000;
    document.documentElement.toggleAttribute("data-mobile", isMobile);

    if (updateTheme) {
      var darkmode =
        window.GRAPHTOOL_CONFIG?.INTERFACE?.PREFERRED_DARK_MODE_THEME?.toLowerCase() ||
        "system";
      if (darkmode === "system") {
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? (darkmode = "dark")
          : (darkmode = "light");
      }
      document.documentElement.setAttribute("data-theme", darkmode);
    }
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
      const initialPhones = GRAPHTOOL_CONFIG.INITIAL_PHONES;
      initialPhones.forEach(async (phone) => {
        const matchingPhone = this.coreAPI.MetadataParser.searchFRInfoWithFullName(phone);
        await this.coreAPI.DataProvider.addFRData("phone", matchingPhone.identifier, {
          dispSuffix: matchingPhone.dispSuffix,
        });
      });
      // Add Initial Targets
      const initialTargets = window.GRAPHTOOL_CONFIG.INITIAL_TARGETS;
      initialTargets.forEach(async (target) => {
        if (this.coreAPI.MetadataParser.isTargetAvailable(target)) {
          await this.coreAPI.DataProvider.addFRData("target", target);
        }
      });
    }
  },
};

export default CoreEvent;
