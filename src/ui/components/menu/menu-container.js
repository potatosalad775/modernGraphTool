import MenuState from "../../../model/menu-state.js";
import { menuContainerStyles } from "./menu-container.styles.js";

class MenuContainer extends HTMLElement {
  constructor() {
    super();

    const _coreMenuPanelHTML = MenuState.getCoreMenuPanels();

    this.className = "menu-container";
    this.innerHTML = `
      <div class="menu-slider">
        <div class="menu-panels">
          ${_coreMenuPanelHTML}
        </div>
      </div>
      <style>
        ${menuContainerStyles}
      </style>
    `;

    this._addEventListener();
  }

  _addEventListener() {
    window.addEventListener('core:menu-switched', (e) => {
      const panels = this.querySelectorAll('.menu-panel');
      panels.forEach(panel => {
        if(panel.id === e.detail.target) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
      });
    });
  };
}

customElements.define("menu-container", MenuContainer);