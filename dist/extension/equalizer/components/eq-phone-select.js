import { StringLoader, DataProvider } from "../../../core.min.js";
import { equalizerIcon } from "../equalizer.styles.js";

class EQSelect extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
      <select class="eq-source-select">
        <option value="">
          ${StringLoader.getString('extension.equalizer.phone-select.option-source', 'Select device to EQ')}
        </option>
      </select>
      ${equalizerIcon.getSVG('arrowDown')}
      <select class="eq-target-select">
        <option value="">
          ${StringLoader.getString('extension.equalizer.phone-select.option-target', 'Select target for AutoEQ')}
        </option>
      </select>
    `;

    this.sourceSelect = this.querySelector('.eq-source-select');
    this.targetSelect = this.querySelector('.eq-target-select');
  }

  connectedCallback() {
    this._setupGraphSelector(null, true);
    this._setupEventListeners();
  }

  _setupGraphSelector(uuid = null, init = false) {
    if(!init) {
      // Add new device with input UUID
      const data = DataProvider.getFRData(uuid);
      const option = document.createElement('option');
      option.value = uuid;
      option.textContent = `${data.identifier} ${data.dispSuffix || ''}`.trim();

      if(data.type === 'phone') { this.sourceSelect.appendChild(option.cloneNode(true)); }
      this.targetSelect.appendChild(option.cloneNode(true));
    } else {
      // Clear existing options except the placeholder
      this.sourceSelect.innerHTML = `<option value="">
        ${StringLoader.getString('extension.equalizer.phone-select.option-source', 'Select device to EQ')}
      </option>`;
      this.targetSelect.innerHTML = `<option value="">
        ${StringLoader.getString('extension.equalizer.phone-select.option-target', 'Select target for AutoEQ')}
      </option>`;

      // Initialize with existing phones
      Array.from(DataProvider.frDataMap).forEach(([uuid, data]) => {
        if (data.type !== 'inserted-eq') { // Skip EQ curves
          const option = document.createElement('option');
          option.value = uuid;
          option.textContent = `${data.identifier} ${data.dispSuffix || ''}`.trim();
          
          if(data.type === 'phone') { this.sourceSelect.appendChild(option.cloneNode(true)); }
          this.targetSelect.appendChild(option);
        }
      });
    }
    
    this._sortSelectOptions();
  }

  _setupEventListeners() {
    window.addEventListener("core:fr-phone-added", (e) => this._setupGraphSelector(e.detail.uuid));
    window.addEventListener("core:fr-target-added", (e) => this._setupGraphSelector(e.detail.uuid));
    window.addEventListener("core:fr-phone-removed", (e) => {
      this.sourceSelect.querySelector(`option[value="${e.detail.uuid}"]`).remove();
      this.targetSelect.querySelector(`option[value="${e.detail.uuid}"]`).remove();
      this._dispatchSelectRemovedEvent(e.detail.uuid);
    });
    window.addEventListener("core:fr-target-removed", (e) => {
      this.targetSelect.querySelector(`option[value="${e.detail.uuid}"]`).remove();
      this._dispatchSelectRemovedEvent(e.detail.uuid);
    });
    this.sourceSelect.addEventListener('change', () => 
      this._dispatchSelectEvent('source', this.sourceSelect.value)
    );
    this.targetSelect.addEventListener('change', () => 
      this._dispatchSelectEvent('target', this.targetSelect.value)
    );
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  _sortSelectOptions() {
    // Sort source options with empty value first, then alphabetically
    Array.from(this.sourceSelect.children)
      .sort((a, b) => {
        if (!a.value) return -1;
        if (!b.value) return 1;
        return a.textContent.localeCompare(b.textContent);
      })
      .forEach(option => this.sourceSelect.appendChild(option));

    // Sort target options with empty value first, then Target suffix, then alphabetically
    Array.from(this.targetSelect.children)
      .sort((a, b) => {
        if (!a.value) return -1;
        if (!b.value) return 1;
        const aIsTarget = a.textContent.endsWith(' Target');
        const bIsTarget = b.textContent.endsWith(' Target');
        if (aIsTarget && !bIsTarget) return -1;
        if (!aIsTarget && bIsTarget) return 1;
        return a.textContent.localeCompare(b.textContent);
      })
      .forEach(option => this.targetSelect.appendChild(option));
  }

  _updateLanguage() {
    this.sourceSelect.querySelector('option[value=""]').innerHTML = StringLoader.getString(
      'extension.equalizer.phone-select.option-source', 'Select device to EQ'
    );
    this.targetSelect.querySelector('option[value=""]').innerHTML = StringLoader.getString(
      'extension.equalizer.phone-select.option-target', 'Select target for AutoEQ'
    );
  }

  _dispatchSelectEvent(type, uuid) {
    this.dispatchEvent(new CustomEvent('equalizer:select-changed', {
      bubbles: true,
      composed: true,
      detail: { type: type, uuid: uuid }
    }));
  }

  _dispatchSelectRemovedEvent(uuid) {
    this.dispatchEvent(new CustomEvent('equalizer:select-removed', {
      bubbles: true,
      composed: true,
      detail: { uuid: uuid }
    }));
  }
}

customElements.define('eq-select', EQSelect);