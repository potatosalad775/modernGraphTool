import { MenuState, DataProvider, MetadataParser, GtToast } from "../../core.min.js";

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
      <div>
        <button class="btn-toast" data-type="success">Test Success Toast</button>
        <button class="btn-toast" data-type="error">Test Error Toast</button>
        <button class="btn-toast" data-type="warning">Test Warning Toast</button>
        <button class="btn-toast" data-type="loading">Test Loading Toast</button>
      </div>
    `;

    // Bind event handlers
    this.handleFRBtnClick = this.handleFRBtnClick.bind(this);
    this.handleMetaBtnClick = this.handleMetaBtnClick.bind(this);
    this.handleTestToastBtnClick = this.handleTestToastBtnClick.bind(this);
  }

  connectedCallback() {
    this.shadowRoot.querySelector('.btn-fr').addEventListener('click', this.handleFRBtnClick);
    this.shadowRoot.querySelector('.btn-meta').addEventListener('click', this.handleMetaBtnClick);
    this.shadowRoot.querySelectorAll('.btn-toast').forEach(btn => {
      btn.addEventListener('click', this.handleTestToastBtnClick);
    });
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector('.btn-fr').removeEventListener('click', this.handleFRBtnClick);
    this.shadowRoot.querySelector('.btn-meta').removeEventListener('click', this.handleMetaBtnClick);
    this.shadowRoot.querySelectorAll('.btn-toast').forEach(btn => {
      btn.removeEventListener('click', this.handleTestToastBtnClick);
    });
  }

  handleFRBtnClick() {
    console.log(DataProvider.frDataMap);
  }

  handleMetaBtnClick() {
    console.log(MetadataParser.phoneMetadata);
  }

  handleTestToastBtnClick(e) {
    const type = e.target.dataset.type;
    if (type === 'loading') {
      const loadingToastId = GtToast.loading({ title: 'Loading', message: 'This is a loading toast message' });
      setTimeout(() => {
        GtToast.update(loadingToastId, {
          title: 'Loading Complete',
          message: 'The loading has finished successfully',
          type: 'success'
        });
      }, 3000);
    } else if (type === 'error') {
      GtToast.error({ title: 'Error', message: 'This is an error toast message' });
    } else if (type === 'warning') {
      GtToast.warning({ title: 'Warning', message: 'This is a warning toast message' });
    } else {
      GtToast.success({ title: 'Success', message: 'This is a success toast message' });
    }
  }
}

// You need to add dashes(-) when defining custom elements
// https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements
customElements.define('template-element', TemplateElement);
MenuState.addExtensionMenu('template', 'TEMPLATE', 'template-element');