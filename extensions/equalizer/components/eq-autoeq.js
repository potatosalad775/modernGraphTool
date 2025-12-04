import { DataProvider, StringLoader } from "../../../core.min.js";
import { Equalizer } from "../util/equalizer.js";

class EQAutoEQ extends HTMLElement {
  constructor() {
    super();
    this.config = {};
    this.worker = null;
    this.workerReady = false;
    this.pendingRequests = new Map();
    this.requestId = 0;

    this.currentDeviceUUID = {
      source: null,
      target: null,
    };
    this.currentEQBands = 10; // Default Value

    this.innerHTML = `
      <div class="auto-eq-container">
        <div class="ae-params">
          <fieldset class="ae-param-row">
            <legend class="ae-filter-label">${StringLoader.getString('extension.equalizer.autoeq.filter-setting', 'Filter Settings')}</legend>
            <label class="ae-use-shelf-filter-label" for="ae-use-shelf-filter-input">${StringLoader.getString('extension.equalizer.autoeq.use-shelf-filter', 'Use LSF / HSF Filter')}</label>
            <input type="checkbox" id="ae-use-shelf-filter-input" checked>
          </fieldset>
          <fieldset class="ae-param-row">
            <legend class="ae-freq-label">${StringLoader.getString('extension.equalizer.autoeq.freq-range', 'Frequency Range')}</legend>
            <label class="ae-min-label" for="ae-freq-min-input">${StringLoader.getString('extension.equalizer.autoeq.min', 'Min')}</label>
            <input type="number" id="ae-freq-min-input" value="20" min="20" max="20000">
            <label class="ae-max-label" for="ae-freq-max-input">${StringLoader.getString('extension.equalizer.autoeq.max', 'Max')}</label>
            <input type="number" id="ae-freq-max-input" value="15000" min="20" max="20000">
          </fieldset>
          <fieldset class="ae-param-row">
            <legend class="ae-q-label">${StringLoader.getString('extension.equalizer.autoeq.q-range', 'Q Range')}</legend>
            <label class="ae-min-label" for="ae-q-min-input">${StringLoader.getString('extension.equalizer.autoeq.min', 'Min')}</label>
            <input type="number" id="ae-q-min-input" value="0.5" min="0.1" max="10" step="0.1">
            <label class="ae-max-label" for="ae-q-max-input">${StringLoader.getString('extension.equalizer.autoeq.max', 'Max')}</label>
            <input type="number" id="ae-q-max-input" value="2.0" min="0.1" max="10" step="0.1">
          </fieldset>
          <fieldset class="ae-param-row">
            <legend class="ae-gain-label">${StringLoader.getString('extension.equalizer.autoeq.gain-range', 'Gain Range')}</legend>
            <label class="ae-min-label" for="ae-gain-min-input">${StringLoader.getString('extension.equalizer.autoeq.min', 'Min')}</label>
            <input type="number" id="ae-gain-min-input" value="-12" min="-40" max="0">
            <label class="ae-max-label" for="ae-gain-max-input">${StringLoader.getString('extension.equalizer.autoeq.max', 'Max')}</label>
            <input type="number" id="ae-gain-max-input" value="12" min="0" max="40">
          </fieldset>
        </div>
        <p class="ae-description">${StringLoader.getString('extension.equalizer.autoeq.description', 'AutoEQ will use as many filters as available.')}</p>
        <gt-button class="ae-generate-eq">${StringLoader.getString('extension.equalizer.autoeq.run-button', 'Run AutoEQ')}</gt-button>
      </div>
    `;

    this._initWorker();
  }

  _initWorker() {
    try {
      // Get the worker URL relative to this component
      const workerUrl = new URL('./util/equalizer.worker.js', import.meta.url);
      this.worker = new Worker(workerUrl, { type: 'classic' });
      this.workerReady = true;
      
      this.worker.onmessage = (e) => {
        const { type, id, payload } = e.data;
        const pending = this.pendingRequests.get(id);
        
        if (pending) {
          this.pendingRequests.delete(id);
          if (type === 'result') {
            pending.resolve(payload.filters);
          } else if (type === 'error') {
            pending.reject(new Error(payload.message));
          }
        }
      };
      
      this.worker.onerror = (error) => {
        console.warn('AutoEQ Worker error, falling back to main thread:', error.message);
        this.workerReady = false;
      };
    } catch (error) {
      console.warn('Failed to initialize AutoEQ Worker, falling back to main thread:', error.message);
      this.workerReady = false;
    }
  }

  _runAutoEQInWorker(source, target, options) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      
      this.worker.postMessage({
        type: 'autoEQ',
        id,
        payload: { source, target, options }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('AutoEQ computation timed out'));
        }
      }, 30000);
    });
  }

  connectedCallback() {
    this._setupEventListeners();
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  disconnectedCallback() {
    // Clean up the worker when component is removed
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }

  setConfig(config) {
    this.config = config;
    this.currentEQBands = parseInt(config?.INITIAL_EQ_BANDS) || this.currentEQBands;
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
      this.setAttribute('aria-busy', 'false');
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
    const freqMin = parseInt(this.querySelector('#ae-freq-min-input').value) || 20;
    const freqMax = parseInt(this.querySelector('#ae-freq-max-input').value) || 15000;
    const qMin = parseFloat(this.querySelector('#ae-q-min-input').value) || 0.5;
    const qMax = parseFloat(this.querySelector('#ae-q-max-input').value) || 2.0;
    const gainMin = parseFloat(this.querySelector('#ae-gain-min-input').value) || -12;
    const gainMax = parseFloat(this.querySelector('#ae-gain-max-input').value) || 12;
    const useShelfFilter = this.querySelector('#ae-use-shelf-filter-input').checked;

    // Use the channel data directly from DataProvider
    const getChannelData = (data) => {
      return data.channels?.AVG?.data || 
             data.channels?.L?.data || 
             data.channels?.R?.data ||
             data.channels.data;
    };

    const sourcePoints = getChannelData(sourceData) || [];
    const targetPoints = getChannelData(targetData) || [];

    const options = {
      maxFilters: this.currentEQBands,
      freqRange: [freqMin, freqMax],
      qRange: [qMin, qMax],
      gainRange: [gainMin, gainMax],
      useShelfFilter: useShelfFilter,
    };

    let filters;
    
    // Try to use Web Worker for better performance
    if (this.worker && this.workerReady) {
      try {
        filters = await this._runAutoEQInWorker(sourcePoints, targetPoints, options);
      } catch (error) {
        console.warn('Worker failed, falling back to main thread:', error);
        // Fallback to main thread
        const equalizer = new Equalizer();
        filters = equalizer.autoEQ(sourcePoints, targetPoints, options);
      }
    } else {
      // Fallback: run on main thread with requestAnimationFrame to allow UI updates
      filters = await new Promise(resolve => {
        requestAnimationFrame(() => {
          const equalizer = new Equalizer();
          const result = equalizer.autoEQ(sourcePoints, targetPoints, options);
          resolve(result);
        });
      });
    }

    // Dispatch event with generated filters
    this.dispatchEvent(new CustomEvent('equalizer:auto-eq-generated', {
      bubbles: true,
      composed: true,
      detail: { filters: filters }
    }));
  }

  _updateLanguage() {
    const freqLabel = this.querySelector('.ae-freq-label');
    if(freqLabel) {
      freqLabel.innerHTML = StringLoader.getString('extension.equalizer.autoeq.freq-range', 'Frequency Range');
    }
    const qLabel = this.querySelector('.ae-q-label');
    if(qLabel) {
      qLabel.innerHTML = StringLoader.getString('extension.equalizer.autoeq.q-range', 'Q Range');
    }
    const gainLabel = this.querySelector('.ae-gain-label');
    if(gainLabel) {
      gainLabel.innerHTML = StringLoader.getString('extension.equalizer.autoeq.gain-range', 'Gain Range');
    }
    const useShelfFilterLabel = this.querySelector('.ae-use-shelf-filter-label');
    if(useShelfFilterLabel) {
      useShelfFilterLabel.innerHTML = StringLoader.getString('extension.equalizer.autoeq.use-shelf-filter', 'Use Shelf Filter');
    }
    const description = this.querySelector('.ae-description');
    if(description) {
      description.innerHTML = StringLoader.getString('extension.equalizer.autoeq.description', 'AutoEQ will use as many filters as available.');
    }
    const generateEQButton = this.querySelector('.ae-generate-eq');
    if(generateEQButton) {
      generateEQButton.innerHTML = StringLoader.getString('extension.equalizer.autoeq.run-button', 'Run AutoEQ');
    }
    const minLabels = this.querySelectorAll('.ae-min-label');
    minLabels.forEach(label => {
      label.innerHTML = StringLoader.getString('extension.equalizer.autoeq.min', 'Min');
    });
    const maxLabels = this.querySelectorAll('.ae-max-label');
    maxLabels.forEach(label => {
      label.innerHTML = StringLoader.getString('extension.equalizer.autoeq.max', 'Max');
    });
  }
}

customElements.define('eq-autoeq', EQAutoEQ);