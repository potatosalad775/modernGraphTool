const gtButtonStyles = `
  :host {
    display: inline-flex;
    border-radius: 2.5rem;
  }

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1rem;
    border-radius: 2.5rem;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.2s ease;
    width: 100%;
    height: 100%;
    gap: 0.5rem;

    svg {
      width: 1rem;
      height: 1rem;
    }
  }

  .button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .checkbox {
    display: none;
  }

  .filled {
    background: var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    border: none;
  }

  .filled-tonal {
    background: var(--gt-color-secondary-container);
    color: var(--gt-color-on-secondary-container);
    border: none;
  }

  .filled-tertiary {
    background: var(--gt-color-tertiary-container);
    color: var(--gt-color-on-tertiary-container);
    border: none;
  }

  .outlined {
    background: transparent;
    border: 1px solid var(--gt-color-outline);
    color: var(--gt-color-primary);
  }

  /* Style for Toggle Button */
  .toggleable input {
    display: none;
  }

  .toggleable.filled:has(input:checked) {
    background: var(--gt-color-primary-container);
    color: var(--gt-color-on-primary-container);
  }

  .toggleable.filled-tonal:has(input:checked) {
    background: var(--gt-color-secondary);
    color: var(--gt-color-on-secondary);
  }

  .toggleable.filled-tertiary:has(input:checked) {
    background: var(--gt-color-tertiary);
    color: var(--gt-color-on-tertiary);
  }

  .toggleable.outlined:has(input:checked) {
    border: 1px solid var(--gt-color-primary);
    color: var(--gt-color-on-primary);
    background: var(--gt-color-primary);
  }

  @media (hover: hover) and (pointer: fine) {
    .filled:hover {
      filter: var(--gt-hover-filter);
    }
    .filled-tonal:hover {
      filter: var(--gt-hover-filter);
    }
    .filled-tertiary:hover {
      filter: var(--gt-hover-filter);
    }
    .outlined:hover {
      background: var(--gt-shadow);
    }
  }

  /* Touch feedback styles */
  .filled:active {
    filter: var(--gt-hover-filter);
    transition: filter 0s;
  }
  .filled-tonal:active {
    filter: var(--gt-hover-filter);
    transition: filter 0s;
  }
  .filled-tertiary:active {
    filter: var(--gt-hover-filter);
    transition: filter 0s;
  }
  .outlined:active {
    background: var(--gt-shadow);
    transition: background 0s;
  }
`;

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