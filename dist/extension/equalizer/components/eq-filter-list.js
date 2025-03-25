import { StringLoader } from "../../../core.min.js";
import { Equalizer } from "../util/equalizer.js";
import { equalizerIcon } from "../equalizer.styles.js";
import { EQUALIZER_CONFIG } from "../main.js";

class EQFilterList extends HTMLElement {
  constructor() {
    super();
    this.eqBands = parseInt(EQUALIZER_CONFIG?.INITIAL_EQ_BANDS) || 10;
    this.extraEQBandsMax = parseInt(EQUALIZER_CONFIG?.MAXIMUM_EQ_BANDS) || 20;

    this.innerHTML = `
    <div class="eq-filter-header">
      <div class="preamp-row">
        <label>${StringLoader.getString('extension.equalizer.filter-list.preamp', 'Preamp')}:</label>
        <span class="preamp-value">0.0 dB</span>
      </div>
      <div class="eq-filter-button-row">
        <button class="add-filter" title="Add Band">${equalizerIcon.getSVG('plus')}</button>
        <button class="remove-filter" title="Remove Band">${equalizerIcon.getSVG('subtract')}</button>
        <button class="sort-filters" title="Sort by Frequency">${equalizerIcon.getSVG('sortDesc')}</button>
      </div>
    </div>
    <div class="eq-filter-bands"></div>
    <div class="eq-data-button-row">
      <gt-button class="import-filters" title="Import" variant="outlined" style="flex: 1">
        ${equalizerIcon.getSVG('import', 'width: 1rem; height: 1rem;')}
        <span>${StringLoader.getString('extension.equalizer.filter-list.import', 'Import')}</span>
      </gt-button>
      <gt-button class="export-filters" title="Export" variant="outlined" style="flex: 1">
        ${equalizerIcon.getSVG('export', 'width: 1rem; height: 1rem;')}
        <span>${StringLoader.getString('extension.equalizer.filter-list.export', 'Export')}</span>
      </gt-button>
    </div>
    <div class="eq-data-button-row">
      <gt-button class="export-graphic" title="Export as Graphic EQ" variant="outlined" style="flex: 1">
        ${equalizerIcon.getSVG('export', 'width: 1rem; height: 1rem;')}
        <span>${StringLoader.getString('extension.equalizer.filter-list.export-graphic-eq', 'Export as Graphic EQ (Wavelet)')}</span>
      </gt-button>
    </div>
    `;

    this._setupFilterElements();
  };

  connectedCallback() {
    this._setupEventListener();
    
    // Add listener for auto-eq results
    document.addEventListener('equalizer:auto-eq-generated', (e) => {
      const filters = e.detail.filters;
      this._updateFilterElementsWithValues(filters);
      this._dispatchFilterUpdateEvent();
    });

    // Add StringLoader Observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
  };

  _setupFilterElements(init = true) {
    // Create filter band elements
    if(init) {
      this.querySelector('.eq-filter-bands').innerHTML = '';
    }

    // Add single filter band if it's not in init mode
    const iter = init ? this.eqBands : 1;
    for (let i = 0; i < iter; i++) {
      const filterBand = document.createElement('div');
      filterBand.className = 'eq-filter-band';
      filterBand.innerHTML = `
        <label>
          <input type="checkbox" checked class="filter-enabled" />
        </label>
        <select class="filter-type">
          <option value="PK">${StringLoader.getString('extension.equalizer.filter-list.peak', 'Peak')}</option>
          <option value="LSQ">${StringLoader.getString('extension.equalizer.filter-list.lowshelf', 'Low Shelf')}</option>
          <option value="HSQ">${StringLoader.getString('extension.equalizer.filter-list.highshelf', 'High Shelf')}</option>
        </select>
        <input type="number" class="filter-freq" placeholder="${StringLoader.getString('extension.equalizer.filter-list.freq', 'Frequency (Hz)')}" min="20" max="20000" />
        <input type="number" class="filter-q" placeholder="${StringLoader.getString('extension.equalizer.filter-list.q', 'Q')}" min="0.1" max="10" step="0.1" />
        <input type="number" class="filter-gain" placeholder="${StringLoader.getString('extension.equalizer.filter-list.gain', 'Gain (dB)')}" min="-30" max="30" step="0.1" />
      `;
      this.querySelector('.eq-filter-bands').appendChild(filterBand);

      // Add event listeners to the new filter band
      filterBand.querySelector('.filter-enabled').addEventListener('change', () => this._dispatchFilterUpdateEvent());
      filterBand.querySelector('.filter-type').addEventListener('change', () => this._dispatchFilterUpdateEvent());
      filterBand.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', () => this._dispatchFilterUpdateEvent());
      });
    }
  };

  _setupEventListener() {
    // Add event listeners for buttons
    this.querySelector('.add-filter').addEventListener('click', () => {
      if(this.eqBands < this.extraEQBandsMax) {
        this.eqBands = Math.min(this.eqBands + 1, this.extraEQBandsMax);
        this._setupFilterElements(false);
        this._dispatchFilterUpdateEvent();
      }
    });
    this.querySelector('.remove-filter').addEventListener('click', () => {
      if(this.eqBands > 1) {
        this.eqBands = Math.max(this.eqBands - 1, 1);
        this.querySelector('.eq-filter-bands').removeChild(this.querySelector('.eq-filter-bands').lastChild);
        this._dispatchFilterUpdateEvent();
      }
    });
    this.querySelector('.sort-filters').addEventListener('click', () => {
      this._sortFilters();
      this._dispatchFilterUpdateEvent();
    });
    this.querySelector('.import-filters').addEventListener('click', () => {
      this._importFilters();
      this._dispatchFilterUpdateEvent();
    });
    this.querySelector('.export-filters').addEventListener('click', () => {
      this._exportFilters();
    });
    this.querySelector('.export-graphic').addEventListener('click', () => {
      this._exportGraphicEQ();
    });
  };

  _getFiltersFromElements() {
    const filters = [];
    const filterElements = this.querySelectorAll('.eq-filter-band');

    filterElements.forEach(elem => {
      const enabled = elem.querySelector('.filter-enabled').checked;
      const type = elem.querySelector('.filter-type').value;
      const freq = parseFloat(elem.querySelector('.filter-freq').value);
      const q = parseFloat(elem.querySelector('.filter-q').value);
      const gain = parseFloat(elem.querySelector('.filter-gain').value);

      if (freq && q && gain) {
        filters.push({ enabled, type, freq, q, gain });
      }
    });

    return filters;
  };

  _sortFilters() {
    const filters = this._getFiltersFromElements();
    filters.sort((a, b) => a.freq - b.freq);
    this._updateFilterElementsWithValues(filters);
  };

  _updateFilterElementsWithValues(filters) {
    this.eqBands = filters.length;
    this._setupFilterElements();
    
    const filterElements = this.querySelectorAll('.eq-filter-band');
    filters.forEach((filter, i) => {
      const elem = filterElements[i];
      elem.querySelector('.filter-enabled').checked = !filter.disabled;
      elem.querySelector('.filter-type').value = filter.type;
      elem.querySelector('.filter-freq').value = filter.freq;
      elem.querySelector('.filter-q').value = filter.q;
      elem.querySelector('.filter-gain').value = filter.gain;
    });
  };

  _updatePreampDisplay() {
    const filters = this._getFiltersFromElements();
    if (!filters.length) return 0;
    
    // Get frequency response without filters
    const baseFreqs = Array.from({ length: 100 }, (_, i) => 
      20 * Math.pow(10, i * Math.log10(20000/20)/99));
    const baseFR = baseFreqs.map(f => [f, 0]);

    const eq = new Equalizer();
    this.preamp = eq.calculatePreamp(baseFR, filters);
    this.querySelector('.preamp-value').textContent = 
      `${this.preamp.toFixed(1)} dB`;
  }

  _importFilters() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const text = e.target.result;
        const filters = this._parseFilterText(text);
        if (filters.length) {
          this._updateFilterElementsWithValues(filters);
          this._dispatchFilterUpdateEvent();
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  };

  _exportFilters() {
    const filters = this._getFiltersFromElements();
    if (!filters.length) {
      alert(StringLoader.getString(
        'extension.equalizer.filter-list.no-filter-export-alert', 
        'Please add at least one filter before exporting.'
      ));
      return;
    }

    let settings = `Preamp: ${this.preamp.toFixed(1)} dB\n`;
    filters.forEach((f, i) => {
      const on = 'ON';
      let type = f.type;
      if (type === 'LSQ' || type === 'HSQ') {
        type = type.substr(0, 2) + 'C';
      }
      settings += `Filter ${i + 1}: ${on} ${type} Fc ${f.freq.toFixed(0)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(3)}\n`;
    });

    this._downloadText(settings, 'filters.txt');
  };

  _exportGraphicEQ() {
    const filters = this._getFiltersFromElements();
    if (!filters.length) {
      alert(StringLoader.getString(
        'extension.equalizer.filter-list.no-filter-export-alert', 
        'Please add at least one filter before exporting.'
      ));
      return;
    }

    const eq = new Equalizer();
    const graphicEQ = eq.convertFilterAsGraphicEQ(filters);
    const settings = 'GraphicEQ: ' + graphicEQ.map(([f, gain]) => 
      `${f.toFixed(0)} ${gain.toFixed(1)}`).join('; ');

    this._downloadText(settings, 'graphic_eq.txt');
  };

  _downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  _parseFilterText(text) {
    const filters = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('Preamp:')) {
        const match = line.match(/Preamp:\s*([+-]?\d*\.?\d+)\s*dB/);
        if (match) {
          this.preamp = parseFloat(match[1]);
          this.querySelector('.preamp-value').textContent = `${this.preamp.toFixed(1)} dB`;
        }
      } else if (line.includes('Filter')) {
        const match = line.match(/(\w+)\s+Fc\s+(\d+)\s+Hz\s+Gain\s+([+-]?\d*\.?\d+)\s+dB\s+Q\s+([+-]?\d*\.?\d+)/);
        if (match) {
          const [_, type, freq, gain, q] = match;
          filters.push({
            enabled: true,
            type: type === 'LSC' ? 'LSQ' : type === 'HSC' ? 'HSQ' : type,
            freq: parseFloat(freq),
            gain: parseFloat(gain),
            q: parseFloat(q)
          });
        }
      }
    }
    
    return filters;
  };
  
  _updateLanguage() {
    this.querySelector('.preamp-row > label').innerHTML = `${StringLoader.getString('extension.equalizer.filter-list.preamp', 'Preamp')}:`;
    this.querySelector('.import-filters > span').innerHTML = `${StringLoader.getString('extension.equalizer.filter-list.import', 'Import')}`;
    this.querySelector('.export-filters > span').innerHTML = `${StringLoader.getString('extension.equalizer.filter-list.export', 'Export')}`;
    this.querySelector('.export-graphic > span').innerHTML = `${StringLoader.getString('extension.equalizer.filter-list.export-graphic-eq', 'Export as Graphic EQ (Wavelet)')}`;
    this.querySelectorAll('.filter-type > option[value="PK"]').forEach(e => e.innerHTML = StringLoader.getString('extension.equalizer.filter-list.peak', 'Peak'));
    this.querySelectorAll('.filter-type > option[value="LSQ"]').forEach(e => e.innerHTML = StringLoader.getString('extension.equalizer.filter-list.lowshelf', 'Low Shelf'));
    this.querySelectorAll('.filter-type > option[value="HSQ"]').forEach(e => e.innerHTML = StringLoader.getString('extension.equalizer.filter-list.highshelf', 'High Shelf'));
    this.querySelectorAll('.filter-freq').forEach(e => e.placeholder = StringLoader.getString('extension.equalizer.filter-list.freq', 'Frequency (Hz)'));
    this.querySelectorAll('.filter-q').forEach(e => e.placeholder = StringLoader.getString('extension.equalizer.filter-list.q', 'Q'));
    this.querySelectorAll('.filter-gain').forEach(e => e.placeholder = StringLoader.getString('extension.equalizer.filter-list.gain', 'Gain (dB)'));
  };

  _dispatchFilterUpdateEvent() {
    this._updatePreampDisplay();
    this.dispatchEvent(new CustomEvent('equalizer:filters-changed', {
      bubbles: true,
      composed: true,
      detail: { 
        filters: this._getFiltersFromElements(),
        preamp: this.preamp,
        eqBandCount: this.eqBands,
      }
    }));
  };
};

customElements.define('eq-filter-list', EQFilterList);