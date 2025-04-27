import StringLoader from '../../../model/util/string-loader.js';
import ConfigGetter from '../../../model/util/config-getter.js';

class LanguageSelector extends HTMLElement {
  constructor() {
    super();

    this._langList = ConfigGetter.get('LANGUAGE.LANGUAGE_LIST') || ["en", "English"], ["ko", "한국어"];

    // Generate options HTML from language list
    const optionsHTML = this._langList
      .map(([lang, name]) => `<option value="${lang}">${name || lang}</option>`)
      .join('');

    this.innerHTML = `
      <select class="lang-select">
        ${optionsHTML}
      </select>
      <style>
        language-selector {
          flex: 1;
        }
        .lang-select {
          width: 100%;
          height: 100%;
          padding: 0.5rem;
        }
      </style>
    `;

    this.select = this.querySelector('.lang-select');
    this.select.value = StringLoader.getCurrentLanguage();
    
    this.select.addEventListener('change', async () => {
      await StringLoader.loadLanguage(this.select.value);
    });
  }
}

customElements.define('language-selector', LanguageSelector);