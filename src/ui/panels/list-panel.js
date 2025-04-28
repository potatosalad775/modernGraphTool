class ListPanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <div class="menu-panel" id="list-panel" data-target="list-panel">
      <!-- selection-list should be positioned here -->
    </div>
    `;
  }

  // a method to get the container where the list should go
  get contentContainer() {
    return this.querySelector('#list-panel');
  }
}

customElements.define("list-panel", ListPanel);