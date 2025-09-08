class DragDivider extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.class = "main-divider";
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 5px;
          background: var(--gt-color-outline-variant);
          cursor: col-resize;
          transition: background 0.2s;
        }
        :host(.dragging) {
          background: var(--gt-color-primary);
        }
      </style>
    `;
    
    this._isDragging = false;
    this._startX = 0;
    this._initialWidth = 0;
  }

  connectedCallback() {
    this.addEventListener('mousedown', this._startDrag);
    document.addEventListener('mouseup', this._stopDrag);
    document.addEventListener('mousemove', this._handleDrag);
  }

  disconnectedCallback() {
    this.removeEventListener('mousedown', this._startDrag);
    document.removeEventListener('mouseup', this._stopDrag);
    document.removeEventListener('mousemove', this._handleDrag);
  }

  _startDrag = (e) => {
    this._isDragging = true;
    this._startX = e.clientX;
    this._initialWidth = this.parentElement.getBoundingClientRect().width;
    this.classList.add('dragging');
  };

  _handleDrag = (e) => {
    if (!this._isDragging) return;
    const deltaX = e.clientX - this._startX;

    const mainContent = document.querySelector('.main-content');
    const { width: containerWidth, x: containerX } = mainContent.getBoundingClientRect();
    const newWidthPercentage = ((e.clientX - containerX) / containerWidth) * 100;
    
    mainContent.style.gridTemplateColumns = `
      clamp(400px, ${newWidthPercentage}%, calc(100% - 346px))
      5px 
      minmax(340px, 1fr)
    `;
  };

  _stopDrag = () => {
    if (!this._isDragging) return;
    this._isDragging = false;
    this.classList.remove('dragging');
  };
}

customElements.define('drag-divider', DragDivider);