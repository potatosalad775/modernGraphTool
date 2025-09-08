import StringLoader from "../../../model/util/string-loader.js";
import CoreEvent from "../../../core-event.js";

class InspectionToggle extends HTMLElement {
  constructor() {
    super();
    this._isEnabled = false;
    
    this.innerHTML = `
      <gt-button variant="outlined" style="height: 2.5rem">
        <span>${StringLoader.getString('inspection-toggle.label', 'Inspect')}</span>
        <gt-divider style="width: 1px"></gt-divider>
        <b>${this._isEnabled ? 'ON' : 'OFF'}</b>
      </gt-button>
    `;
    
    this._button = this.querySelector('gt-button');
    this._button.addEventListener('click', this._toggleInspection.bind(this));
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  _toggleInspection(e) {
    e.preventDefault();
    
    this._isEnabled = !this._isEnabled;
    this._updateButton();
    
    // Dispatch event to notify render engine
    CoreEvent.dispatchEvent('inspection-mode-change', { 
      enabled: this._isEnabled 
    });
  }

  _updateButton() {
    this._button.innerHTML = `
      ${StringLoader.getString('inspection-toggle.label', 'Inspect')}
      <gt-divider style="width: 1px"></gt-divider>
      <b>${this._isEnabled ? 'ON' : 'OFF'}</b>
    `;
    
    // Update button styling to indicate active state
    if (this._isEnabled) {
      this._button.setAttribute('variant', 'filled');
    } else {
      this._button.setAttribute('variant', 'outlined');
    }
  }

  _updateLabel() {
    this.querySelector('span').textContent = StringLoader.getString('inspection-toggle.label', 'Inspect');
  }

  get isEnabled() {
    return this._isEnabled;
  }
}

customElements.define('inspection-toggle', InspectionToggle);
