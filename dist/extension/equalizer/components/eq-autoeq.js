import { DataProvider, StringLoader } from "../../../core.min.js";
import { Equalizer } from "../util/equalizer.js";
import { EQUALIZER_CONFIG } from "../main.js";

class EQAutoEQ extends HTMLElement {
  constructor() {
    super();

    this.currentDeviceUUID = {
      source: null,
      target: null,
    };
    this.currentEQBands = parseInt(EQUALIZER_CONFIG?.INITIAL_EQ_BANDS) || 10;

    this.innerHTML = `
      <div class="auto-eq-container">
        <div class="ae-params">
          <div class="ae-param-row">
            <label class="ae-freq-label">${StringLoader.getString('extension.equalizer.autoeq.freq-range', 'Frequency Range')}</label>
            <input type="number" class="freq-min" value="20" min="20" max="20000">
            <input type="number" class="freq-max" value="15000" min="20" max="20000">
          </div>
          <div class="ae-param-row">
            <label class="ae-q-label">${StringLoader.getString('extension.equalizer.autoeq.q-range', 'Q Range')}</label>
            <input type="number" class="q-min" value="0.5" min="0.1" max="10" step="0.1">
            <input type="number" class="q-max" value="2.0" min="0.1" max="10" step="0.1">
          </div>
          <div class="ae-param-row">
            <label class="ae-gain-label">${StringLoader.getString('extension.equalizer.autoeq.gain-range', 'Gain Range')}</label>
            <input type="number" class="gain-min" value="-12" min="-40" max="0">
            <input type="number" class="gain-max" value="12" min="0" max="40">
          </div>
        </div>
        <p class="ae-description">${StringLoader.getString('extension.equalizer.autoeq.description', 'AutoEQ will use as many filters as available.')}</p>
        <gt-button class="ae-generate-eq">${StringLoader.getString('extension.equalizer.autoeq.run-button', 'Run AutoEQ')}</gt-button>
      </div>
    `;
  }

  connectedCallback() {
    this._setupEventListeners();
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  _setupEventListeners() {
    // Listen for select changes
    document.addEventListener('equalizer:select-changed', (e) => {
      this.currentDeviceUUID[e.detail.type] = e.detail.uuid;
    });
    document.addEventListener('equalizer:select-removed', (e) => {
      Object.keys(this.currentDeviceUUID).forEach(key => {
        if (this.currentDeviceUUID[key] === e.detail.uuid) {
          this.currentDeviceUUID[key] = null;
        }
      });
    });

    // Listen for Filter List Update
    document.addEventListener('equalizer:filters-changed', (e) => {
      this.currentEQBands = e.detail.eqBandCount;
    });

    // Button Event Listener
    this.querySelector('.ae-generate-eq').addEventListener('click', async () => {
      this.setAttribute('aria-busy', 'true');
      await this._generateEQ();
      this.removeAttribute('aria-busy');
    });
  }

  async _generateEQ() {
    const sourceUUID = this.currentDeviceUUID.source;
    const targetUUID = this.currentDeviceUUID.target;
    
    if (!sourceUUID || !targetUUID) {
      alert('Please select both source and target graphs');
      return;
    }

    const sourceData = DataProvider.getFRData(sourceUUID);
    const targetData = DataProvider.getFRData(targetUUID);

    // Get frequency range and constraints from inputs
    const freqMin = parseInt(this.querySelector('.freq-min').value) || 20;
    const freqMax = parseInt(this.querySelector('.freq-max').value) || 15000;
    const qMin = parseFloat(this.querySelector('.q-min').value) || 0.5;
    const qMax = parseFloat(this.querySelector('.q-max').value) || 2.0;
    const gainMin = parseFloat(this.querySelector('.gain-min').value) || -12;
    const gainMax = parseFloat(this.querySelector('.gain-max').value) || 12;

    // Use the channel data directly from DataProvider
    const getChannelData = (data) => {
      return data.channels?.AVG?.data || 
             data.channels?.L?.data || 
             data.channels?.R?.data ||
             data.channels.data;
    };

    const sourcePoints = getChannelData(sourceData) || [];
    const targetPoints = getChannelData(targetData) || [];

    // Create equalizer instance and generate filters
    const equalizer = new Equalizer();
    const filters = equalizer.autoEQ(sourcePoints, targetPoints, {
      maxFilters: this.currentEQBands,
      freqRange: [freqMin, freqMax],
      qRange: [qMin, qMax],
      gainRange: [gainMin, gainMax]
    });

    // Dispatch event with generated filters
    this.dispatchEvent(new CustomEvent('equalizer:auto-eq-generated', {
      bubbles: true,
      composed: true,
      detail: { filters: filters }
    }));
  }

  _updateLanguage() {
    this.querySelector('.ae-freq-label').innerHTML = StringLoader.getString('extension.equalizer.autoeq.freq-range', 'Frequency Range');
    this.querySelector('.ae-q-label').innerHTML = StringLoader.getString('extension.equalizer.autoeq.q-range', 'Q Range');
    this.querySelector('.ae-gain-label').innerHTML = StringLoader.getString('extension.equalizer.autoeq.gain-range', 'Gain Range');
    this.querySelector('.ae-description').innerHTML = StringLoader.getString('extension.equalizer.autoeq.description', 'AutoEQ will use as many filters as available.');
    this.querySelector('.ae-generate-eq').innerHTML = StringLoader.getString('extension.equalizer.autoeq.run-button', 'Run AutoEQ');
  }
}

customElements.define('eq-autoeq', EQAutoEQ);