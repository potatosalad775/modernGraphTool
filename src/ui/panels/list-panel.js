class ListPanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <div class="menu-panel" id="list-panel" data-target="list-panel">
      <selection-list></selection-list>
    </div>
    `;
  }
}

customElements.define("list-panel", ListPanel);