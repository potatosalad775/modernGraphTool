import { MenuState, DataProvider } from "../../core.min.js";
import { Equalizer } from "./util/equalizer.js";
import { equalizerStyles } from "./equalizer.styles.js";

// Events Used in Equalizer Extension
// equalizer:auto-eq-generated - detail:uuid
// equalizer:filters-changed - detail:filters
// equalizer:select-changed - detail:type / uuid
// equalizer:select-removed

export default class EqualizerExtension extends HTMLElement {
  constructor(config = {}) {
    super();
    //this.attachShadow({ mode: 'open' });
    
    this.config = config;
    this.currentFilters = {
      filters: [],
      preamp: null,
    };
    this.currentDeviceUUID = {
      source: null,
      target: null,
    }
    this.currentSourceUUID = null;

    (async () => {
      await this._initializeComponents();
      this._initializeStyles();
      this._setupEventListeners();
      
      // Get audio player after components are initialized
      this.audioPlayer = this.querySelector('eq-audio-player');
    })();
  }

  async _initializeComponents() {
    // Import components
    await import('./components/eq-filter-list.js');
    await import('./components/eq-phone-select.js');
    await import('./components/eq-audio-player.js');
    await import('./components/eq-autoeq.js');
    await import('./components/eq-uploader.js');
    
    this.innerHTML = `
      <div class="equalizer-container">
        <div class="eq-controls">
          <eq-filter-list></eq-filter-list>
        </div>
        <div class="eq-controls">
          <eq-select></eq-select>
          <eq-autoeq></eq-autoeq>
          <eq-audio-player></eq-audio-player>
          <eq-uploader></eq-uploader>
        </div>
      </div>
    `;

    // Pass configuration to components
    const filterList = this.querySelector('eq-filter-list');
    const autoEq = this.querySelector('eq-autoeq');

    // Set configuration for each component
    [filterList, autoEq].forEach(component => {
      if (component) {
        component.setConfig?.(this.config);
      }
    });
  }

  _initializeStyles() {
    const style = document.createElement('style');
    style.textContent = equalizerStyles;

    this.appendChild(style);
  }

  _setupEventListeners() {
    // Listen for select changes
    document.addEventListener('equalizer:select-changed', (e) => {
      if(e.detail.type === 'source') { this.currentSourceUUID = e.detail.uuid;}
      this._updatePreview();
    });
    document.addEventListener('equalizer:select-removed', (e) => {
      if(this.currentSourceUUID === e.detail.uuid) { this.currentSourceUUID = null; }
      this._updatePreview();
    });

    // Listen for filter list changes
    document.addEventListener('equalizer:filters-changed', (e) => {
      this.currentFilters = {
        filters: e.detail.filters,
        preamp: e.detail.preamp,
      };
      this._updatePreview();
      // Update audio player filters
      this.audioPlayer.updateFilters(this.currentFilters);
    });
  }

  // Update Equalizer Preview Graph
  _updatePreview() {
    if (this.currentSourceUUID === null) return;

    const filters = this.currentFilters.filters;
    //if (!filters.length) return; // Even if no filters, it should still update the preview

    const selectedPhone = DataProvider.getFRData(this.currentSourceUUID);
    if (!selectedPhone) return;

    // Process each channel
    const channelData = {};
    const channelKeys = Object.keys(selectedPhone.channels);
    
    // Apply Equalizer Filters for each Channel Data
    channelKeys.forEach(channel => {
      if (selectedPhone.channels[channel]) {
        const equalizer = new Equalizer();
        const frequencies = [...selectedPhone.channels[channel].data.map(point => point[0])];
        const baselineValues = [...selectedPhone.channels[channel].data.map(point => point[1])];
        const eqGains = equalizer.calculateGainsFromFilter(frequencies, filters);
        
        // Combine baseline with EQ
        const combinedData = frequencies.map((f, i) => [f, baselineValues[i] + eqGains[i]]);

        channelData[channel] = {
          data: combinedData,
          metadata: {...selectedPhone.channels[channel].metadata}
        };
      }
    });

    // Check if EQ curve already exists
    let matchingEQGraphUUID;
    const isEqualizerGraphIncluded = Array.from(DataProvider.frDataMap).some(([uuid, obj]) => {
      if (obj.type === 'inserted-eq' && 
          obj.identifier === selectedPhone.identifier && 
          obj.dispSuffix === `${selectedPhone.dispSuffix.trim()} (EQ)`) {
        matchingEQGraphUUID = uuid;
        return true;
      }
      return false;
    });

    if(isEqualizerGraphIncluded) {
      // Update current EQ curve
      DataProvider.updateFRDataWithRawData(matchingEQGraphUUID, channelData, {
        identifier: `${selectedPhone.identifier}`,
        dispSuffix: `${selectedPhone.dispSuffix} (EQ)`,
      });
    } else {
      const dispChannel = Object.keys(selectedPhone.channels).includes('AVG') ? 'AVG' : selectedPhone.channels[0];
      // Insert EQ curve as a new FR object
      DataProvider.insertRawFRData(
        'eq',
        `${selectedPhone.identifier}`,
        channelData,
        {
          dispChannel: [dispChannel],
          dispSuffix: `${selectedPhone.dispSuffix} (EQ)`,
          basePhoneId: this.currentSourceUUID,
        }
      );
    }
  }
}

customElements.define('equalizer-extension', EqualizerExtension);
// Add 'EQUALIZER' Menu to the bottom menu carousel
MenuState.addExtensionMenu('equalizer', 'EQUALIZER', 'equalizer-extension');