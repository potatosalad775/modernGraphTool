import urlProvider from "../../../model/url-provider.js";
import StringLoader from "../../../model/util/string-loader.js";
import { IconProvider } from "../../../styles/icon-provider.js";

class ShareButton extends HTMLElement {
  constructor() {
    super();
    
    this._buttonStyle = 'margin-top: -1px; width: 1.2rem; height: 1.2rem;'
    this.innerHTML = `
      <gt-button variant="filled-tonal" style="height: 2.5rem">
        ${IconProvider.Icon('share', this._buttonStyle)}
        <span>${StringLoader.getString('share-button.label', 'Share')}</span>
      </gt-button>
    `;
    
    this._button = this.querySelector('gt-button');
    this._button.addEventListener('click', this._copyURL);
  }

  connectedCallback() {
    StringLoader.addObserver(this._updateLabel.bind(this));
  }

  disconnectedCallback() {
    StringLoader.removeObserver(this._updateLabel.bind(this));
  }

  _copyURL = async (e) => {
    await navigator.clipboard.writeText(urlProvider.getCurrentURL());
    
    this._button.innerHTML = `
      ${IconProvider.Icon('share', this._buttonStyle)}
      ${StringLoader.getString('share-button.on-click', 'Copied!')}
    `;
    
    setTimeout(() => {
      this._button.innerHTML = `
        ${IconProvider.Icon('share', this._buttonStyle)}
        ${StringLoader.getString('share-button.label', 'Share')}
      `;
    }, 1000);
  };

  _updateLabel() {
    this.querySelector('span').textContent = StringLoader.getString('share-button.label', 'Share');
  }
}

customElements.define('share-button', ShareButton);