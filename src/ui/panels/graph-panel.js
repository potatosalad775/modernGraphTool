class GraphPanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <!-- Graph panel -->
    <div class="menu-panel" id="graph-panel" data-target="graph-panel">
      <target-selector style="margin-bottom: 1rem;"></target-selector>
      <selection-list></selection-list>
    </div>
    `;

    this.graphButtonContainer = document.createElement("div");
    this.graphButtonContainer.className = "graph-button-container";
    this.graphButtonContainer.innerHTML = `
      <style>
        .graph-button-container {
          display: flex;
          flex-wrap: wrap;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 1rem;

          h3 {
            margin: 0;
            color: var(--gt-color-on-surface);
          }
        }
      </style>
      <normalizer-input></normalizer-input>
      <smoothing-button></smoothing-button>
      <graph-scale-button></graph-scale-button>
      <graph-screenshot-button></graph-screenshot-button>
      <share-button></share-button>
    `;

    this._updateUI();

    window.addEventListener("core:ui-mode-change", this._updateUI.bind(this));
  }

  _updateUI(e = null) {
    if (!e) {
      this.isMobile = window.innerWidth < 1000;
    } else {
      this.isMobile = e.detail.isMobile;
    }

    // Remove container from current location if it exists in DOM
    if (this.graphButtonContainer.parentNode) {
      this.graphButtonContainer.parentNode.removeChild(this.graphButtonContainer);
    }

    if (this.isMobile) {
      // Insert Tutorial in Graph Panel
      const graphPanel = document.querySelector('#graph-panel');
      if (graphPanel && !graphPanel.querySelector('.graph-button-container')) {
        graphPanel.appendChild(this.graphButtonContainer);
      }
    } else {
      // Insert Tutorial in Main Graph List
      const graphList = document.querySelector('.main-graph-list');
      if (graphList && !graphList.querySelector('.graph-button-container')) {
        graphList.appendChild(this.graphButtonContainer);
      }
    }
  }
}

customElements.define("graph-panel", GraphPanel);