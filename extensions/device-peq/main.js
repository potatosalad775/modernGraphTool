import { CoreExtension } from "../../core.min.js";

// Extension metadata for version compatibility
export const EXTENSION_METADATA = {
  name: 'device-peq',
  version: '1.0.2',
  apiLevel: 1,
  coreMinVersion: '1.0.0',
  coreMaxVersion: '1.0.x',
  description: 'Device PEQ extension for modernGraphTool',
  author: 'potatosalad775'
};

export default class DevicePEQLoader {
  constructor(config = {}) {
    this.config = config;
    this.retryCounter = 0;
    this.equalizerInstance = null;

    // Store original console.log before devicePEQ plugin overrides it
    this.originalConsoleLog = console.log;
    this.originalConsoleWarn = console.warn;
    this.originalConsoleError = console.error;

    // Terminate if equalizer extension is not enabled
    const extensionList = CoreExtension.getExtensionList();
    if (!extensionList.some(ext => ext.NAME === 'equalizer')) {
      console.warn('devicePEQ extension: Equalizer extension is not enabled.');
      return;
    }

    this._init();
  }

  async _init() {
    // Check retry counter
    if (this.retryCounter > 5) {
      console.warn('devicePEQ extension: Equalizer extension is not loaded.');
      return;
    }

    // Check if equalizer-extension element is loaded, and repeat if not
    const equalizerExtensionContainer = document.querySelector('equalizer-extension');
    if (!equalizerExtensionContainer) {
      this.retryCounter += 1;
      setTimeout(this._init.bind(this), 200);
      return;
    }

    // Get equalizer extension instance
    this.retryCounter = 0;
    this.equalizerInstance = CoreExtension.getExtension('equalizer');
    this.eqFilterListElement = this.equalizerInstance.querySelector('eq-filter-list');

    // Modify EQ Element to ensure it's compatible with devicePEQ (for CrinGraph)
    this._equalizerElementModifier();
    
    // Load devicePEQ
    try {
      const devicePEQPlugin = await import(import.meta.resolve("./devicePEQ/plugin.js"));
      await devicePEQPlugin.default({
        filtersToElem: this.filtersToElem.bind(this),
        elemToFilters: this.elemToFilters.bind(this),
        calcEqDevPreamp: this.calcEqDevPreamp.bind(this),
        applyEQ: this.applyEQ.bind(this),
        config: {
          showLogs: this.config.SHOW_LOGS || false, // Show logs in console
          advanced: this.config.ADVANCED || false, // Allow advanced dialogs
        },
      });
      
      // Restore original console methods after plugin loads
      this._restoreOriginalConsole();
    } catch (e) {
      console.error('devicePEQ extension: An error occurred while loading devicePEQ plugin:', e);
    }

    // Modify devicePEQ element to better adapt to modernGraphTool
    this._devicePEQElementModifier();
  }

  _restoreOriginalConsole() {
    // Store devicePEQ's overridden console methods before restoring originals
    const devicePEQConsoleLog = console.log;
    const devicePEQConsoleWarn = console.warn;
    const devicePEQConsoleError = console.error;
    
    // Restore original console methods to prevent devicePEQ from suppressing logs
    if (this.originalConsoleLog) {
      console.log = this.originalConsoleLog;
    }
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    
    // Create a hybrid console that routes devicePEQ calls to their logging system
    // while keeping normal console behavior for everything else
    const hybridConsoleLog = (...args) => {
      // Check if the call is coming from devicePEQ context
      const stack = new Error().stack;
      const isFromDevicePEQ = stack && (
        stack.includes('/devicePEQ/') || 
        stack.includes('devicePEQ') ||
        stack.includes('plugin.js')
      );
      
      if (isFromDevicePEQ) {
        // Use devicePEQ's logging system for devicePEQ calls
        devicePEQConsoleLog.apply(console, args);
      } else {
        // Use original console for all other calls
        this.originalConsoleLog.apply(console, args);
      }
    };
    
    const hybridConsoleWarn = (...args) => {
      const stack = new Error().stack;
      const isFromDevicePEQ = stack && (
        stack.includes('/devicePEQ/') || 
        stack.includes('devicePEQ') ||
        stack.includes('plugin.js')
      );
      
      if (isFromDevicePEQ) {
        devicePEQConsoleWarn.apply(console, args);
      } else {
        this.originalConsoleWarn.apply(console, args);
      }
    };
    
    const hybridConsoleError = (...args) => {
      const stack = new Error().stack;
      const isFromDevicePEQ = stack && (
        stack.includes('/devicePEQ/') || 
        stack.includes('devicePEQ') ||
        stack.includes('plugin.js')
      );
      
      if (isFromDevicePEQ) {
        devicePEQConsoleError.apply(console, args);
      } else {
        this.originalConsoleError.apply(console, args);
      }
    };
    
    // Replace console methods with hybrid versions
    console.log = hybridConsoleLog;
    console.warn = hybridConsoleWarn;
    console.error = hybridConsoleError;
    
    // Keep devicePEQ's logging functionality available as backup
    console.devicePEQLog = devicePEQConsoleLog;
  }

  _equalizerElementModifier() {
    // Create and append devicePEQ element container
    const equalizerExtensionContainer = document.querySelector('equalizer-extension');
    const devicePEQContainer = document.createElement('div');
    devicePEQContainer.id = 'devicePEQContainer';
    devicePEQContainer.innerHTML = this._devicePEQContainerHTML;
    // devicePEQ appends its element next to '.extra-eq'
    const devicePEQElementBait = document.createElement('div');
    devicePEQElementBait.classList.add('extra-eq');
    // Insert 'bait' into devicePEQContainer
    devicePEQContainer.appendChild(devicePEQElementBait);
    equalizerExtensionContainer.appendChild(devicePEQContainer);
  }

  _devicePEQElementModifier() {
    // Move peqModal to body
    const peqModal = document.getElementById('deviceInfoModal');
    if(peqModal) {
      document.body.appendChild(peqModal);
    }
    
  }

  //
  // Helper functions to bridge devicePEQ to modernGraphTool
  //

  filtersToElem(filters) {
    console.log(this.eqFilterListElement);

    if(!this.eqFilterListElement) {
      console.error('devicePEQ extension: required equalizer element not found.');
      return;
    }

    console.log(filters);

    // Update equalizer element with filter value
    this.eqFilterListElement._updateFilterElementsWithValues(filters);
    return;
  }

  elemToFilters() {
    if(!this.eqFilterListElement) {
      console.error('devicePEQ extension: required equalizer element not found.');
      return;
    }

    // Get filter value from equalizer element
    const filters = this.eqFilterListElement._getFiltersFromElements();
    return filters;
  }

  calcEqDevPreamp(filters) {
    const maxGain = Math.max(...filters.map(f => f.gain));
    //console.log("Calculated Preamp Gain:", -maxGain);
    return -maxGain; // Simple logic to avoid clipping
  }

  applyEQ() {
    if(!this.eqFilterListElement) {
      console.error('devicePEQ extension: required equalizer element not found.');
      return;
    }

    // Apply EQ to equalizer element (by announcing that filter is updated)
    this.eqFilterListElement._dispatchFilterUpdateEvent();
    return;
  }

  //
  // Custom style for devicePEQ elements 
  //

  _devicePEQContainerHTML = `
    <style>
      .modal-content {
        background-color: var(--gt-color-surface) !important;

        button {
          background-color: var(--gt-color-surface-container-highest) !important;
          color: var(--gt-color-on-surface) !important;
        }

        button.active {
          background-color: var(--gt-color-primary) !important;
          color: var(--gt-color-on-primary) !important;
        }
      }

      .device-eq {
        display: flex;
        flex-direction: column;

        h5 {
          font-size: 0.9rem;
          font-weight: 600;
          margin: 1rem 0;
        }

        .settings-row, .peq-slot-area, .filters-button {
          display: flex;
          flex-direction: row;
          justify-content: space-between;
          gap: 0.5rem;

          button {
            height: 2rem;
            border: 1px solid var(--gt-color-outline);
            color: var(--gt-color-primary);
          }

          button[hidden] {
            display: none;
          }
        }

        .settings-row {
          .connect-device, .disconnect-device {
            flex: 1;
            span {
              margin-left: 0.25rem;
            } 
          }

          #deviceInfoBtn {
            width: 2rem;
          }
        }

        .peq-slot-area {
          margin: 0.5rem 0;
        }

        .filters-button {
          button {
            flex: 1;
            margin-bottom: 1rem;
          }
        }
      }
    </style>
    <gt-divider horizontal></gt-divider>
  `;
}