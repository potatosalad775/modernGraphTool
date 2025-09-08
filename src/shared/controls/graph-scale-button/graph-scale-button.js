import GraphEngine from "../../../features/graph/graph-engine.js";
import StringLoader from "../../../model/util/string-loader.js";
import ConfigGetter from "../../../model/util/config-getter.js";

class GraphScaleButton extends HTMLElement {
  constructor() {
    super();
    const defaultScaleValue = parseInt(ConfigGetter.get('VISUALIZATION.DEFAULT_Y_SCALE')) || 60;
    this._options = [40, 60, 80, 100];
    this._currentIndex = this._options.indexOf(defaultScaleValue) || 1; // Defaults to 60
    
    this.innerHTML = `
      <gt-button variant="outlined" style="height: 2.5rem">
        <span>${StringLoader.getString('y-axis-scale-button.label', 'Y-Axis Scale')}</span>
        <gt-divider style="width: 1px"></gt-divider>
        <b>${this._options[this._currentIndex]}dB</b>
      </gt-button>
    `;
    
    this._button = this.querySelector('gt-button');
    this._button.addEventListener('click', this._cycleOption);
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  _cycleOption = (e) => {
    e.preventDefault();
    
    this._currentIndex = (this._currentIndex + 1) % this._options.length;
    this._button.innerHTML = `
      ${StringLoader.getString('y-axis-scale-button.label', 'Y-Axis Scale')}
      <gt-divider style="width: 1px"></gt-divider>
      <b>${this._options[this._currentIndex]}dB</b>
    `;
    GraphEngine.updateYScale(this._options[this._currentIndex])
  };

  _updateLabel() {
    this.querySelector('span').textContent = StringLoader.getString('y-axis-scale-button.label', 'Y-Axis Scale');
  }
}

customElements.define('graph-scale-button', GraphScaleButton);