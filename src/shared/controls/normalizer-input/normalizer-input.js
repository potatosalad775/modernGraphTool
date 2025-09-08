import FRNormalizer from "../../../model/util/fr-normalizer.js";
import StringLoader from "../../../model/util/string-loader.js";
import { normalizerInputStyles } from "./normalizer-input.styles.js";

class NormalizerInput extends HTMLElement {
  constructor() {
    super();

    this.normType = FRNormalizer.type;
    //this.normValueDB = FRNormalizer.dBvalue;
    this.normValueHZ = FRNormalizer.Hzvalue;

    this.className = 'normalizer-input';
    this.innerHTML = `
      <label class="normalizer-number">
        <span>${StringLoader.getString('normalizer-input.label', 'Normalization')}</span>
        <gt-divider style="margin: 0.25rem 0.5rem;"></gt-divider>
        <input type="number" value="${this.normValueHZ}" min="20" max="20000" step="1"
          placeholder="Hz for Normalization" ${this.normType === 'Avg' ? 'disabled' : ''}
        >
      </label>
      <label class="normalizer-radio Hz">
        <input type="radio" name="normType" value="Hz" ${this.normType === 'Hz' ? 'checked' : ''}>
        <span>${StringLoader.getString('normalizer-input.hz-btn', 'Hz')}</span>
      </label>
      <label class="normalizer-radio Avg">
        <input type="radio" name="normType" value="Avg" ${this.normType === 'Avg' ? 'checked' : ''}>
        <span>${StringLoader.getString('normalizer-input.avg-btn', 'Avg.')}</span>
      </label>
    `;

    const style = document.createElement('style');
    style.textContent = normalizerInputStyles;
    this.appendChild(style);

    this._setupEventListeners();
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  _setupEventListeners() {
    // Handle radio button changes
    this.querySelectorAll('input[type=radio]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if(e.target.checked) {
          FRNormalizer.updateNormalizationType(e.target.value);
          FRNormalizer.updateNormalization();
          // Disable Hz Input
          const numberInput = this.querySelector("input[type=number]");
          numberInput.toggleAttribute("disabled", e.target.value === 'Avg');
        }
      });
    });

    // Handle number input changes
    this.querySelector('input[type="number"]').addEventListener('input', (e) => {
      const type = e.target.closest('.dB') ? 'dB' : 'Hz';
      const value = parseFloat(e.target.value);

      FRNormalizer.updateNormalizationValue(type, value);
      FRNormalizer.updateNormalization();
    });
  }

  _updateLabel() {
    this.querySelector('.normalizer-number > span').textContent = StringLoader.getString('normalizer-input.label', 'Normalization');
    this.querySelector('.normalizer-radio.Hz > span').textContent = StringLoader.getString('normalizer-input.hz-btn', 'Hz');
    this.querySelector('.normalizer-radio.Avg > span').textContent = StringLoader.getString('normalizer-input.avg-btn', 'Avg.');
  }
}

customElements.define("normalizer-input", NormalizerInput);
