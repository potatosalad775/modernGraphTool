import DataProvider from "../../../model/data-provider.js";
import CoreEvent from "../../../core-event.js";
import StringLoader from "../../../model/util/string-loader.js";
import ConfigGetter from "../../../model/util/config-getter.js";
import { targetSelectorStyles } from "./target-selector.styles.js";

class TargetSelector extends HTMLElement {
  constructor() {
    super();
    //this.attachShadow({ mode: 'open' });
    this.targets = ConfigGetter.get('TARGET_MANIFEST') || [];
    this.className = "target-selector-container";

    const style = document.createElement('style');
    style.textContent = targetSelectorStyles;
    this.appendChild(style);

    this.targetSelectorGroup = document.createElement("div");
    this.targetSelectorGroup.className = "target-selector-group";
    this.appendChild(this.targetSelectorGroup);

    // Add language change observer
    StringLoader.addObserver(() => {
      this.targets = ConfigGetter.get('TARGET_MANIFEST') || [];
      this._clearAndRender();
    });

    this._init();
  }

  connectedCallback() {
    window.addEventListener('core:fr-target-added', (e) => this._tickTargetButton(e));
    window.addEventListener('core:fr-target-removed', (e) => this._untickTargetButton(e));
    window.addEventListener('core:metadata-loaded', () => this._init());
  }

  disconnectedCallback() {
    window.removeEventListener('core:fr-target-added', (e) => this._tickTargetButton(e));
    window.removeEventListener('core:fr-target-removed', (e) => this._untickTargetButton(e));
    window.removeEventListener('core:metadata-loaded', () => this._init());
    // Remove language observer
    StringLoader.removeObserver(this._clearAndRender);
  }

  _clearAndRender() {
    // Clear existing content
    this.targetSelectorGroup.innerHTML = '';
    this._render();
  }

  _init() {
    // Render components
    this._render();

    // Horizontal Scroll Event Listener
    if(!window.GRAPHTOOL_CONFIG?.INTERFACE?.TARGET?.ALLOW_MULTIPLE_LINE_PER_TYPE) {
      this.classList.add("tsc-single-row");
      this.addEventListener('wheel', (event) => {
        event.currentTarget.scrollLeft += event.deltaY
      }, { passive: true });
    } else {
      this.querySelectorAll('.target-group-item').forEach((group) => {
        group.addEventListener('wheel', (event) => {
          event.currentTarget.scrollLeft += event.deltaY
        }, { passive: true });
      });
    }

    // Dispatch Event
    CoreEvent.dispatchInitEvent("target-ui-ready");
  }

  _render() {
    this.targets.forEach((targetGroup) => {
      const targetGroupItem = document.createElement("div");
      targetGroupItem.className = "target-group-item";
      targetGroupItem.innerHTML = `
        <div class="target-list-container">
          <h4 class="target-group-name">${targetGroup.type}</h4>
          <div class="target-list"></div>
        </div>
      `;

      targetGroup.files.forEach((target) => {
        const identifier = target.includes(' Target') ? target : `${target} Target`;

        const targetItem = `
          <gt-button toggleable variant='outlined' identifier='${identifier}' class='target-list-item'>
            ${window.GRAPHTOOL_CONFIG?.INTERFACE?.TARGET?.OMIT_TARGET_SUFFIX 
              ? `<span class="targetname">${identifier.replace(' Target', '')}</span>`
              : `<span class="targetname">${identifier}</span>`
            }
          </gt-button>
        `;

        // Append Target Checkbox Component
        targetGroupItem.querySelector(".target-list").insertAdjacentHTML('beforeend', targetItem);

        // Attach event listener
        const btnElement = targetGroupItem.querySelector(".target-list > gt-button:last-child");
        btnElement.addEventListener('gt-button-toggle', async () => {
          btnElement.disabled = true;
          btnElement.setAttribute('aria-busy', 'true');

          const wasChecked = DataProvider.isFRDataLoaded(identifier);
          try {
            await DataProvider.toggleFRData("target", identifier, !wasChecked);
          } catch (e) {
            btnElement.toggle(wasChecked, true);
            console.error('Operation failed:', e);
          } finally {
            btnElement.disabled = false;
            btnElement.removeAttribute('aria-busy');
          }
        });
      });
      // Append Target Group Component
      this.targetSelectorGroup.appendChild(targetGroupItem);
    });
  }

  _tickTargetButton(e) {
    const button = this.querySelector(`.target-list-item[identifier="${e.detail.identifier}"]`);
    if (button) { button.toggle(true, true); }
  }

  _untickTargetButton(e) {
    const button = this.querySelector(`.target-list-item[identifier="${e.detail.identifier}"]`);
    if (button) { button.toggle(false, true); }
  }
}

customElements.define("target-selector", TargetSelector);
