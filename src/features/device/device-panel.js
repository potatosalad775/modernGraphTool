class DevicePanel extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
    <!-- Device panel -->
    <div class="menu-panel" id="device-panel" data-target="device-panel">
      <phone-selector></phone-selector>
    </div>
    <style>
      #device-panel {
        padding: 1rem 0 0 0;
        overflow-y: hidden;
        scrollbar-gutter: auto;
      }
    </style>
    `;
  }
}

customElements.define("device-panel", DevicePanel);