class PhonePanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <!-- Phone panel -->
    <div class="menu-panel" id="phone-panel" data-target="phone-panel">
      <phone-selector></phone-selector>
    </div>
    <style>
      #phone-panel {
        padding: 1rem 0 0 0;
        overflow-y: hidden;
        scrollbar-gutter: auto;
      }
    </style>
    `;
  }
}

customElements.define("phone-panel", PhonePanel);