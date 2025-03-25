import { MenuState, DataProvider } from "../../core.min.js";
import { Equalizer } from "./util/equalizer.js";
import { equalizerStyles } from "./equalizer.styles.js";

// Events Used in Equalizer Extension
// equalizer:auto-eq-generated - detail:uuid
// equalizer:filters-changed - detail:filters
// equalizer:select-changed - detail:type / uuid
// equalizer:select-removed

class EqualizerExtension extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    
    this.currentFilters = {
      filters: [],
      preamp: null,
    };
    this.currentDeviceUUID = {
      source: null,
      target: null,
    }
    this.currentSourceUUID = null;

    import('./components/eq-filter-list.js');
    import('./components/eq-phone-select.js');
    import('./components/eq-audio-player.js');
    import('./components/eq-autoeq.js');
    
    shadow.innerHTML = `
      <div class="equalizer-container">
        <div class="eq-controls">
          <eq-filter-list></eq-filter-list>
        </div>
        <div class="eq-controls">
          <eq-select></eq-select>
          <eq-autoeq></eq-autoeq>
          <eq-audio-player></eq-audio-player>
        </div>
      </div>
    `;

    this.equalizer = new Equalizer();
    this.audioPlayer = this.shadowRoot.querySelector('eq-audio-player');

    this._initializeStyles();
    this._setupEventListeners();
  }

  _initializeStyles() {
    const style = document.createElement('style');
    style.textContent = equalizerStyles;

    this.shadowRoot.appendChild(style);
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
    if (!filters.length) return;

    const selectedPhone = DataProvider.getFRData(this.currentSourceUUID);
    if (!selectedPhone) return;

    // Process each channel
    const channelData = {};
    const channelKeys = Object.keys(selectedPhone.channels);
    
    // Apply Equalizer Filters for each Channel Data
    channelKeys.forEach(channel => {
      if (selectedPhone.channels[channel]) {
        const frequencies = [...selectedPhone.channels[channel].data.map(point => point[0])];
        const baselineValues = [...selectedPhone.channels[channel].data.map(point => point[1])];
        const eqGains = this.equalizer.calculateGainsFromFilter(frequencies, filters);
        
        // Combine baseline with EQ
        const combinedData = frequencies.map((f, i) => [f, baselineValues[i] + eqGains[i]]);

        channelData[channel] = {
          data: combinedData,
          metadata: {...selectedPhone.channels[channel].metadata}
        };
      }
    });

    // Remove previous EQ curve if exists
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
      // Insert EQ curve as a new FR object
      DataProvider.insertRawFRData(
        'eq',
        `${selectedPhone.identifier}`,
        channelData,
        {
          dispChannel: selectedPhone.dispChannel,
          dispSuffix: `${selectedPhone.dispSuffix} (EQ)`,
          basePhoneId: this.currentSourceUUID,
        }
      );
    }
  }
}

customElements.define('equalizer-extension', EqualizerExtension);

// Add 'EQUALIZER' Menu to the bottom menu carousel
MenuState.addExtensionMenu('equalizer', 'EQUALIZER', '<equalizer-extension></equalizer-extension>');

// Expose EQUALIZER CONFIG from EXTENSION CONFIG
const EQUALIZER_CONFIG = window.EXTENSION_CONFIG.filter(e => e.NAME === 'equalizer')[0].CONFIG;
export { EQUALIZER_CONFIG };