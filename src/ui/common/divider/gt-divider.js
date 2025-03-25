class GTDivider extends HTMLElement {
  constructor() {
    super();

    // Create shadow DOM for style encapsulation
    const shadow = this.attachShadow({mode: 'open'});

    // Custom Attributes
    this.color = this.getAttribute('color') || 'var(--gt-color-outline)';
    this.width = this.getAttribute('width') || '1px';
    this.style = this.getAttribute('style') || '';
    this.isHorizontal = this.hasAttribute('horizontal');

    shadow.className = 'gt-divider';
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          width: ${this.isHorizontal ? '100%' : this.width};
          height: ${this.isHorizontal ? '1px' : 'auto'};
          background: ${this.color};
          align-self: stretch;
          ${this.style};
        }
      </style>
    `;
  }
}

customElements.define('gt-divider', GTDivider);