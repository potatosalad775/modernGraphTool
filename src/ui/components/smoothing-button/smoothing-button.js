import FRSmoother from "../../../model/util/fr-smoother.js";
import StringLoader from "../../../model/util/string-loader.js";

class SmoothingButton extends HTMLElement {
  constructor() {
    super();
    this._options = ['1/48', '1/24', '1/12', '1/6', '1/3'];
    this._currentIndex = 0; // Defaults to 1/48
    
    this.innerHTML = `
      <gt-button variant="outlined" style="height: 2.5rem">
        <span>${StringLoader.getString('smoothing-button.label', 'Smoothing')}</span>
        <gt-divider style="width: 1px"></gt-divider>
        <b>${this._options[this._currentIndex]}oct</b>
      </gt-button>
    `;
    
    this._button = this.querySelector('gt-button');
    this._button.addEventListener('click', this._cycleOption.bind(this));
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  _cycleOption() {
    this._currentIndex = (this._currentIndex + 1) % this._options.length;
    this._button.innerHTML = `
      ${StringLoader.getString('smoothing-button.label', 'Smoothing')}
      <gt-divider style="width: 1px"></gt-divider>
      <b>${this._options[this._currentIndex]}oct</b>
    `;
    FRSmoother.updateSmoothing(this._options[this._currentIndex])
  };

  _updateLabel() {
    this.querySelector('span').textContent = StringLoader.getString('smoothing-button.label', 'Smoothing');
  }
}

customElements.define('smoothing-button', SmoothingButton);