class GraphPanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <!-- Graph panel -->
    <div class="menu-panel" id="graph-panel" data-target="graph-panel">
      <target-selector></target-selector>
      <gt-divider horizontal style="margin: 1rem 0;"></gt-divider>
      <div class="menu-panel-row" style="padding-bottom: 1rem">
        <share-button></share-button>
        <smoothing-button></smoothing-button>
        <normalizer-input></normalizer-input>
        <graph-scale-button></graph-scale-button>
        <graph-screenshot-button></graph-screenshot-button>
      </div>
    </div>
    `;
  }
}

customElements.define("graph-panel", GraphPanel);