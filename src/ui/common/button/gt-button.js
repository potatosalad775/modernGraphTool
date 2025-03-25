import { gtButtonStyles } from "./gt-button.styles.js";

class GTButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'disabled', 'toggleable'];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({mode: 'open'});
    this._render();
  }

  _render() {
    // Clear existing content
    this.shadow.innerHTML = '';

    // Check if button is toggleable & Create button element
    this.toggleable = this.getAttribute('toggleable') !== null;
    const button = document.createElement(this.toggleable ? 'label' : 'button');
    button.classList.add('button');

    // Add checkbox for toggleable button
    if(this.toggleable) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      button.appendChild(checkbox);
      button.classList.add('toggleable');
      this.checkbox = checkbox;
    }

    // Set button variant
    const variant = this.getAttribute('variant') || 'filled';
    button.classList.add(variant);

    // Set disabled attribute
    if(this.hasAttribute('disabled')) {
      button.classList.add('disabled');
    }
    
    // Add slot for content
    const slot = document.createElement('slot');
    button.appendChild(slot);

    // Add styles
    const style = document.createElement('style');
    style.textContent = gtButtonStyles;
    
    this.shadow.appendChild(button);
    this.shadow.appendChild(style);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._render();
    }
  }

  /**
   * Toggle Button.
   * @param {boolean} checked - Button Status
   * @param {boolean} silent - Silently toggle button without dispatching change event.
   */
  toggle(checked, silent = false) {
    if(this.toggleable) {
      this.checkbox.checked = checked;
      if(!silent) {
        // Dispatch change event to match user interaction
        this.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // Add event forwarding
  connectedCallback() {
    if(this.toggleable) {
      this.checkbox.addEventListener('change', (e) => {
        this.dispatchEvent(new CustomEvent('gt-button-toggle', {
          detail: { checked: e.target.checked },
          bubbles: true
        }));
      });
    }
  }
}

// Define custom element
customElements.define('gt-button', GTButton);