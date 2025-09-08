import DataProvider from "../../../model/data-provider.js";
import CoreEvent from "../../../core-event.js";
import StringLoader from "../../../model/util/string-loader.js";
import ConfigGetter from "../../../model/util/config-getter.js";
import { targetSelectorStyles } from "./target-selector.styles.js";
import { IconProvider } from "../../../styles/icon-provider.js";

class TargetSelector extends HTMLElement {
  constructor() {
    super();
    //this.attachShadow({ mode: 'open' });
    this.targets = ConfigGetter.get('TARGET_MANIFEST') || [];
    this.className = "target-selector-container";
    this.isCollapsed = false;

    const style = document.createElement('style');
    style.textContent = targetSelectorStyles;
    this.appendChild(style);

    this.targetSelectorGroup = document.createElement("div");
    this.targetSelectorGroup.className = "target-selector-group";
    this.appendChild(this.targetSelectorGroup);

    // Add language change observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
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
    StringLoader.removeObserver(this._updateLanguage.bind(this));
  }

  _init() {
    // Render components
    this._render();

    // Horizontal Scroll Event Listener
    if(!ConfigGetter.get('INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE')) {
      this.classList.add("tsc-single-row");
      this._addDragScroll(this);
    } else {
      this.querySelectorAll('.target-group-item').forEach((group) => {
        this._addDragScroll(group);
      });
    }

    // Dispatch Event
    CoreEvent.dispatchInitEvent("target-ui-ready");
  }

  _render() {
    // Add List of Target Groups
    this.targets.forEach((targetGroup) => {
      const targetGroupItem = document.createElement("div");
      targetGroupItem.className = "target-group-item";
      targetGroupItem.innerHTML = `
        <div class="target-list-container">
          <div class="target-group-name"><span>${targetGroup.type}</span></div>
          <div class="target-list"></div>
        </div>
      `;

      targetGroup.files.forEach((target) => {
        const identifier = target.includes(' Target') ? target : `${target} Target`;

        const targetItem = `
          <gt-button toggleable variant='outlined' identifier='${identifier}' class='target-list-item'>
            ${ConfigGetter.get('INTERFACE.TARGET.OMIT_TARGET_SUFFIX') 
              ? `<span class="targetname">${identifier.replace(' Target', '')}</span>`
              : `<span class="targetname">${identifier}</span>`
            }
          </gt-button>
        `;

        // Append Target Checkbox Component
        targetGroupItem.querySelector(".target-list").insertAdjacentHTML('beforeend', targetItem);

        // Attach event listener
        const btnElement = targetGroupItem.querySelector(".target-list > gt-button:last-child");
        btnElement.addEventListener('gt-button-toggle', async (e) => {
          e.preventDefault();
          
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
            btnElement.setAttribute('aria-busy', 'false');
          }
        });
      });
      // Append Target Group Component
      this.targetSelectorGroup.appendChild(targetGroupItem);
    });

    // Add Collapse Button if target is displayed in multiple lines
    if(ConfigGetter.get('INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE')) {
      // Add Button Group
      this.buttonGroup = document.createElement("div");
      this.buttonGroup.className = "tsc-collapse-button-group";

      // Add Collapse Button
      this.collapseButton = document.createElement("button");
      this.collapseButton.className = "tsc-collapse-button";
      this.collapseButton.innerHTML = `
        ${IconProvider.Icon('shortArrowUp', 'width: 1.25rem; height: 1.25rem;')}
        <span>${StringLoader.getString('target-selector.label', 'Target')}</span>
      `;
      this.collapseButton.addEventListener('click', this._toggleCollapse.bind(this));

      // Append Collapse Button & Button Group
      this.buttonGroup.appendChild(this.collapseButton);
      this.appendChild(this.buttonGroup);
    }

    // Collapse Target List on Initial Load
    if(ConfigGetter.get('INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL')) {
      this._toggleCollapse();
    }
  }

  _tickTargetButton(e) {
    const button = this.querySelector(`.target-list-item[identifier="${e.detail.identifier}"]`);
    if (button) { button.toggle(true, true); }
  }

  _untickTargetButton(e) {
    const button = this.querySelector(`.target-list-item[identifier="${e.detail.identifier}"]`);
    if (button) { button.toggle(false, true); }
  }

  _addDragScroll(element) {
    let isDown = false;
    let startX;
    let scrollLeft;

    element.addEventListener('mousedown', (e) => {
      // Prevent default drag behavior (like text selection)
      e.preventDefault();
      isDown = true;
      element.style.cursor = 'grabbing'; // Change cursor to indicate dragging
      element.style.userSelect = 'none'; // Prevent text selection during drag
      startX = e.pageX - element.offsetLeft;
      scrollLeft = element.scrollLeft;
    });

    element.addEventListener('mouseleave', () => {
      if (!isDown) return;
      isDown = false;
      element.style.cursor = 'default'; // Reset cursor
      element.style.userSelect = ''; // Re-enable text selection
    });

    element.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      element.style.cursor = 'default'; // Reset cursor
      element.style.userSelect = ''; // Re-enable text selection
    });

    element.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - element.offsetLeft;
      const walk = (x - startX) * 1.5; // Multiplier for scroll speed adjustment
      element.scrollLeft = scrollLeft - walk;
    });

    // Set initial cursor style
    element.style.cursor = 'default';
  };

  _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      // Apply collapsed state
      this.targetSelectorGroup.classList.add('collapsed');
      this.collapseButton.classList.add('collapsed');
    } else {
      // Remove collapsed state
      this.targetSelectorGroup.classList.remove('collapsed');
      this.collapseButton.classList.remove('collapsed');
    }
  }

  _updateLanguage() {
    // Update Target Group Label
    const targetGroupLabel = this.querySelectorAll('.target-group-name > span');
    if(targetGroupLabel) {
      this.targets = ConfigGetter.get('TARGET_MANIFEST') || [];
      targetGroupLabel.forEach((span, index) => {
        span.textContent = this.targets[index]?.type;
      });
    }
    // Update Collapse Button Label
    if(this.collapseButton) {
      this.collapseButton.innerHTML = `
        ${IconProvider.Icon('shortArrowUp', 'width: 1.25rem; height: 1.25rem;')}
        <span>${StringLoader.getString('target-selector.label', 'Target')}</span>
      `;
    }
  }
}

customElements.define("target-selector", TargetSelector);
