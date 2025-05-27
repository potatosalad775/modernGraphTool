import { MenuState, DataProvider, MetadataParser } from "../../core.min.js";

export default class TemplateElement extends HTMLElement {
  constructor(config = {}) {
    super();
    // Receive Extension Config
    this.config = config;
    // Attach a shadow DOM to the element
    const shadow = this.attachShadow({ mode: 'open' });
    // Create a container element
    const container = document.createElement('div');
    container.classList.add('container');
    // Append the container to the shadow DOM
    shadow.appendChild(container);
    // Add some content to the container
    container.innerHTML = `
      <h1>Template</h1>
      <button class="btn-fr">Print frDataMap</button>
      <button class="btn-meta">Print phoneMetadata</button>
    `;

    // Bind event handlers
    this.handleFRBtnClick = this.handleFRBtnClick.bind(this);
    this.handleMetaBtnClick = this.handleMetaBtnClick.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.btn-fr').addEventListener('click', this.handleFRBtnClick);
    this.shadowRoot.querySelector('.btn-meta').addEventListener('click', this.handleMetaBtnClick);
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector('.btn-fr').removeEventListener('click', this.handleFRBtnClick);
    this.shadowRoot.querySelector('.btn-meta').removeEventListener('click', this.handleMetaBtnClick);
  }

  handleFRBtnClick() {
    console.log(DataProvider.frDataMap);
  }

  handleMetaBtnClick() {
    console.log(MetadataParser.phoneMetadata);
  }
}

// You need to add dashes(-) when defining custom elements
// https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements
customElements.define('template-element', TemplateElement);
MenuState.addExtensionMenu('template', 'TEMPLATE', 'template-element');