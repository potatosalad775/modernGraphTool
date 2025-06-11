import { CoreExtension } from "../../core.min.js";

export default class DevicePEQLoader {
  constructor(config = {}) {
    this.config = config;
    this.retryCounter = 0;
    this.equalizerInstance = null;

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
        config: this.config,
      });
    } catch (e) {
      console.error('devicePEQ extension: An error occurred while loading devicePEQ plugin:', e);
    }

    // Modify devicePEQ element to better adapt to modernGraphTool
    this._devicePEQElementModifier();
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