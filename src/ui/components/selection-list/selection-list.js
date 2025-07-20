import DataProvider from "../../../model/data-provider.js";
import CoreEvent from "../../../core-event.js";
import RenderEngine from "../../visualization/render-engine.js";
import StringLoader from "../../../model/util/string-loader.js";
import { selectionListStyles } from "./selection-list.styles.js";
import { IconProvider } from "../../../styles/icon-provider.js";

class SelectionList extends HTMLElement {
  constructor() {
    super();
    // Bind methods
    this._boundHandleItemAdded = this._handleItemAdded.bind(this);
    this._boundHandleItemRemoved = this._handleItemRemoved.bind(this);
    this._boundHandleItemUpdated = this._handleItemUpdated.bind(this);
    this._boundHandleChannelUpdated = this._handleChannelUpdated.bind(this);
    this._boundUpdateLanguage = this._updateLanguage.bind(this);

    this.listSection = null; // Will hold the main <section> element
    this.styleElement = null; // Will hold the <style> element
    this.init();
  }

  init() {
    // Create and append style
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = selectionListStyles;
    this.appendChild(this.styleElement); // Append style to the container

    // Create and append the main list section
    this.listSection = document.createElement('section');
    this.listSection.className = 'selection-list';
    this.appendChild(this.listSection);

    // Initial Population
    this._updateList(); 

    // Add global event listeners
    window.addEventListener('core:fr-phone-added', this._boundHandleItemAdded);
    window.addEventListener('core:fr-target-added', this._boundHandleItemAdded);
    window.addEventListener('core:fr-unknown-inserted', this._boundHandleItemAdded); 
    window.addEventListener('core:fr-phone-removed', this._boundHandleItemRemoved);
    window.addEventListener('core:fr-target-removed', this._boundHandleItemRemoved);
    window.addEventListener('core:fr-unknown-removed', this._boundHandleItemRemoved);
    window.addEventListener('core:fr-channel-updated', this._boundHandleChannelUpdated);
    window.addEventListener('core:fr-variant-updated', this._boundHandleItemUpdated);
    StringLoader.addObserver(this._boundUpdateLanguage);
  }

  destroy() {
    // Remove global event listeners
    window.removeEventListener('core:fr-phone-added', this._boundHandleItemAdded);
    window.removeEventListener('core:fr-target-added', this._boundHandleItemAdded);
    window.removeEventListener('core:fr-unknown-inserted', this._boundHandleItemAdded);
    window.removeEventListener('core:fr-phone-removed', this._boundHandleItemRemoved);
    window.removeEventListener('core:fr-target-removed', this._boundHandleItemRemoved);
    window.removeEventListener('core:fr-unknown-removed', this._boundHandleItemRemoved);
    window.removeEventListener('core:fr-channel-updated', this._boundHandleChannelUpdated);
    window.removeEventListener('core:fr-variant-updated', this._boundHandleItemUpdated);
    StringLoader.removeObserver(this._boundUpdateLanguage);
  }

  // Initial list population and full refresh (if ever needed)
  _updateList() {
    if (!this.listSection) return; // Guard against calls before init

    this.listSection.innerHTML = ''; // Clear existing items
    const sortedData = Array.from(DataProvider.frDataMap)
      .sort(([, a], [, b]) => a.type === 'target' ? -1 : b.type === 'target' ? 1 : 0);

    sortedData.forEach(([uuid, frData]) => {
      const itemElement = this._createListItemElement(uuid, frData);
      this.listSection.appendChild(itemElement);
      this._attachEventListenersToItem(itemElement);
    });
  }

  // Creates the DOM element for a single list item
  _createListItemElement(uuid, frData) {
    const itemElement = document.createElement('div');
    itemElement.className = 'selection-list-item';
    itemElement.dataset.uuid = uuid;
    itemElement.dataset.type = frData.type;

    itemElement.innerHTML = `
      <div class="sl-item-content">
        <div class="sl-item-heading">
          <button class="sl-color-btn" style="background: ${frData.colors.AVG || frData.colors}"></button>
          <div class="sl-name">
            <span class="sl-identifier">${frData.identifier}</span>
            ${frData.type === 'phone' && frData.meta.files.length > 1 ? `
              <button class="sl-variant-btn" title="Show Variants">${IconProvider.Icon('plus')}</button>
              `
            : ''}
            <span class="sl-variant-name">${frData.dispSuffix}</span>
          </div>
        </div>
        <div class="sl-item-leading">
          ${frData.type !== 'target'
          ? `<div class="sl-channels">
              <select class="sl-channels-select" title="Graph Channel">
                ${this._getChannelOptions(Object.keys(frData.channels), frData.dispChannel)}
              </select>
            </div>`
          : ''}
          <div class="sl-y-offset">
            <button class="sl-y-offset-dec">${IconProvider.Icon('arrowDown')}</button>
            <input type="number" class="sl-y-offset-input" title="Move Graph Vertically" value="0" step="1">
            <button class="sl-y-offset-inc">${IconProvider.Icon('arrowUp')}</button>
          </div>
          <div class="sl-button-row">
            <div class="sl-baseline">
              <button class="sl-button baseline" title="Set Baseline">${IconProvider.Icon('wave', 'width: 1.5rem; height: 1.5rem;')}</button>
            </div>
            <div class="sl-visibility">
              <button class="sl-button visibility ${frData.hidden ? 'hidden' : ''}" title="${frData.hidden ? 'Show' : 'Hide'} Graph">
                ${IconProvider.Icon(frData.hidden ? 'eyeOff' : 'eyeOn', 'width: 1.5rem; height: 1.5rem;')}
              </button>
            </div>
            <div class="sl-actions">
              <button class="sl-button delete" title="Delete Graph">${IconProvider.Icon('delete', 'width: 1.5rem; height: 1.5rem;')}</button>
            </div>
          </div>
        </div>
      </div>
      ${['phone', 'target'].includes(frData.type) && frData.meta.files.length > 1 ? `
      <div class="sl-variant-menu">
        ${frData.meta.files.map((file, i) => (file.suffix !== frData.dispSuffix)
          ? `<div class="sl-variant-item" data-uuid="${uuid}" data-index="${i}">
              <span class="sl-variant-item-name">${frData.identifier} ${file.suffix}</span>
              <button class="sl-button add-variant">${IconProvider.Icon('plus')}</button>
            </div>`
          : ''
        ).join('')}
      </div>
      ` : ''}
    `;
    return itemElement;
  }

  // Handles adding a new item
  _handleItemAdded(event) {
    const { uuid } = event.detail;
    const frData = DataProvider.getFRData(uuid);
    if (!frData) return; // Should not happen

    const newItemElement = this._createListItemElement(uuid, frData);

    // --- Insertion Logic (Maintain Sort Order) ---
    const items = Array.from(this.listSection.children);
    let inserted = false;
    // If it's a target, insert before the first non-target
    if (frData.type === 'target') {
      const firstNonTarget = items.find(item => item.dataset.type !== 'target');
      if (firstNonTarget) {
        this.listSection.insertBefore(newItemElement, firstNonTarget);
        inserted = true;
      }
    }
    // If it's not a target, append after the last target (or at the end if no targets)
    if (!inserted) {
      this.listSection.appendChild(newItemElement); // Simple append for now, refine sorting later if needed for non-targets
    }
    // --- End Insertion Logic ---

    this._attachEventListenersToItem(newItemElement);
  }

  // Handles removing an item
  _handleItemRemoved(event) {
    const { uuid } = event.detail;
    const itemToRemove = this.listSection.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
    if (itemToRemove) {
      itemToRemove.remove();
    }
  }

  // Handles updating an existing item (e.g., variant change)
  _handleItemUpdated(event) {
    const { uuid } = event.detail;
    const frData = DataProvider.getFRData(uuid);
    if (!frData) return; // Data might have been removed concurrently

    const existingItem = this.listSection.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
    if (existingItem) {
      // Create a new element with updated data
      const updatedItemElement = this._createListItemElement(uuid, frData);
      // Replace the old item with the new one
      this.listSection.replaceChild(updatedItemElement, existingItem);
      // Re-attach listeners to the new element
      this._attachEventListenersToItem(updatedItemElement);
    }
  }

  // Handles channel update event
  _handleChannelUpdated(event) {
    const { uuid } = event.detail;
    const itemElement = this.listSection.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
    if (itemElement) {
      const frData = DataProvider.getFRData(uuid);
      if (frData) {
        const channelSelect = itemElement.querySelector('.sl-channels-select');
        if (channelSelect) {
          channelSelect.innerHTML = this._getChannelOptions(Object.keys(frData.channels), frData.dispChannel);
        }
      }
    }
  }

  _getChannelOptions(availableChannel, dispChannel = []) {
    // Get List of Option tags via Array
    let innerHTML = '';
    if (availableChannel.includes('L')) {
      innerHTML += `<option value="L" ${dispChannel.includes('L') && !dispChannel.includes('R') ? 'selected' : ''}>
        ${StringLoader.getString('selection-list.channel-left', 'L')}
      </option>`;
    }
    if (availableChannel.includes('R')) {
      innerHTML += `<option value="R" ${!dispChannel.includes('L') && dispChannel.includes('R') ? 'selected' : ''}>
        ${StringLoader.getString('selection-list.channel-right', 'R')}
      </option>`;
    }
    if (availableChannel.includes('L') && availableChannel.includes('R')) {
      innerHTML += `<option value="L+R" ${dispChannel.includes('L') && dispChannel.includes('R') ? 'selected' : ''}>
        ${StringLoader.getString('selection-list.channel-left-and-right', 'L + R')}
      </option>`;
    }
    if (availableChannel.includes('AVG')) {
      innerHTML += `<option value="AVG" ${dispChannel.includes('AVG') ? 'selected' : ''}>
        ${StringLoader.getString('selection-list.channel-average', 'Average')}
      </option>`;
    }
    return innerHTML;
  }

  // Attaches event listeners to a single item element
  _attachEventListenersToItem(itemElement) {
    // --- Color Button ---
    const colorBtn = itemElement.querySelector('.sl-color-btn');
    if (colorBtn) {
      colorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = itemElement.dataset.uuid;
        const type = itemElement.dataset.type;
        const newColor = DataProvider._getColorWithType(type);
        DataProvider.updateColors('uuid', uuid, newColor);
        e.target.style.background = newColor.AVG || newColor;
      });
    }

    // --- Variant Select Menu Button ---
    const variantBtn = itemElement.querySelector('.sl-variant-btn');
    if (variantBtn) {
      variantBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const button = e.currentTarget;
        const variantMenu = itemElement.querySelector('.sl-variant-menu');
        const shouldHide = button.classList.contains('active');
        if (shouldHide) {
          button.setAttribute('title', 'Show Variants');
          button.innerHTML = IconProvider.Icon('plus');
        } else {
          button.setAttribute('title', 'Hide Variants');
          button.innerHTML = IconProvider.Icon('subtract');
        }
        variantMenu.classList.toggle('active', !shouldHide);
        button.classList.toggle('active', !shouldHide);
      });
    }

    // --- Variant Item Buttons ---
    itemElement.querySelectorAll('.sl-variant-item').forEach(selector => {
      // Switch to Variant
      selector.addEventListener('click', async (e) => {
        if (e.target.closest('.add-variant')) return; // Don't trigger if add button clicked
        e.preventDefault();
        const variantMenu = selector.closest('.sl-variant-menu');
        variantMenu.setAttribute('aria-busy', 'true');
        const uuid = itemElement.dataset.uuid;
        const index = selector.dataset.index;
        const dataMap = DataProvider.getFRData(uuid);
        await DataProvider.updateVariant(uuid, dataMap.meta.files[parseInt(index)].suffix);
        // No need to set aria-busy false, as _handleItemUpdated will replace the element
      });

      // Add Variant Button
      const addVariantBtn = selector.querySelector('.sl-button.add-variant');
      if (addVariantBtn) {
        addVariantBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = itemElement.dataset.uuid;
          const index = selector.dataset.index;
          const dataMap = DataProvider.getFRData(uuid);
          DataProvider.addFRData('phone', dataMap.identifier, {
            dispSuffix: dataMap.meta.files[parseInt(index)].suffix
          });
        });
      }
    });

    // --- Channel Select Menu ---
    const channelSelect = itemElement.querySelector('.sl-channels-select');
    if (channelSelect) {
      channelSelect.addEventListener('change', (e) => {
        const uuid = itemElement.dataset.uuid;
        const channelMap = { "L": ["L"], "R": ["R"], "L+R": ["L", "R"], "AVG": ["AVG"] };
        DataProvider.updateDisplayChannel('uuid', uuid, channelMap[e.target.value]);
      });
    }

    // --- Y-Offset Input & Buttons ---
    const yOffsetContainer = itemElement.querySelector('.sl-y-offset');
    if (yOffsetContainer) {
      const yOffsetInput = yOffsetContainer.querySelector('.sl-y-offset-input');
      const yOffsetDec = yOffsetContainer.querySelector('.sl-y-offset-dec');
      const yOffsetInc = yOffsetContainer.querySelector('.sl-y-offset-inc');

      yOffsetInput.addEventListener('input', (e) => {
        const uuid = itemElement.dataset.uuid;
        const offset = parseFloat(e.target.value) || 0;
        const curves = document.querySelectorAll(`.fr-graph-curve-container path[uuid='${uuid}']`);
        curves.forEach(curve => {
            curve.setAttribute('transform', `translate(0,${0 - offset})`);
        });
      });

      const setupLongPress = (button, action) => {
        let pressTimer;
        let isPressed = false;
        const performAction = () => {
          const input = yOffsetContainer.querySelector('.sl-y-offset-input');
          const currentValue = parseInt(input.value) || 0;
          input.value = action === 'inc' ? currentValue + 1 : currentValue - 1;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        button.addEventListener('mousedown', () => {
          isPressed = true;
          performAction();
          pressTimer = setInterval(() => { if (isPressed) performAction(); }, 150);
        });
        const stopAction = () => {
          isPressed = false;
          clearInterval(pressTimer);
        };
        button.addEventListener('mouseup', stopAction);
        button.addEventListener('mouseleave', stopAction);
      };

      setupLongPress(yOffsetDec, 'dec');
      setupLongPress(yOffsetInc, 'inc');
    }


    // --- Baseline Button ---
    const baselineBtn = itemElement.querySelector('.sl-button.baseline');
    if (baselineBtn) {
      baselineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const button = e.currentTarget;
        const uuid = itemElement.dataset.uuid;
        const isActive = button.classList.contains('active');

        RenderEngine.updateBaselineData(!isActive, { uuid: uuid });

        // Update *all* baseline buttons in the list
        this.listSection.querySelectorAll('.sl-button.baseline').forEach(btn => {
          if (btn === button) { // Current button
            if (!isActive) {
              btn.setAttribute('title', 'Reset Baseline');
              btn.innerHTML = IconProvider.Icon('flatline', 'width: 1.5rem; height: 1.5rem;');
              btn.classList.add('active');
            } else {
              btn.setAttribute('title', 'Set Baseline');
              btn.innerHTML = IconProvider.Icon('wave', 'width: 1.5rem; height: 1.5rem;');
              btn.classList.remove('active');
            }
          } else { // Other buttons
             if (!isActive) { // If we just activated one, deactivate others
                btn.classList.remove('active');
                btn.setAttribute('title', 'Set Baseline');
                btn.innerHTML = IconProvider.Icon('wave', 'width: 1.5rem; height: 1.5rem;');
             }
          }
        });
      });
      // Set initial state if it's the current baseline
      const currentBaseline = RenderEngine.getBaselineData();
      if (currentBaseline && currentBaseline.uuid === itemElement.dataset.uuid) {
        baselineBtn.classList.add('active');
        baselineBtn.setAttribute('title', 'Reset Baseline');
        baselineBtn.innerHTML = IconProvider.Icon('flatline', 'width: 1.5rem; height: 1.5rem;');
      }
    }

    // --- Visibility Button ---
    const visibilityBtn = itemElement.querySelector('.sl-button.visibility');
    if (visibilityBtn) {
      visibilityBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const button = e.currentTarget;
        const uuid = itemElement.dataset.uuid;
        const dataObj = DataProvider.getFRData(uuid);
        if (!dataObj) return; // Might have been removed

        const shouldHide = !button.classList.contains('hidden');
        dataObj.hidden = shouldHide;
        DataProvider.frDataMap.set(uuid, dataObj);
        
        if (shouldHide) {
          button.setAttribute('title', 'Show Graph');
          button.innerHTML = IconProvider.Icon('eyeOff', 'width: 1.5rem; height: 1.5rem;');
        } else {
          button.setAttribute('title', 'Hide Graph');
          button.innerHTML = IconProvider.Icon('eyeOn', 'width: 1.5rem; height: 1.5rem;');
        }
        button.classList.toggle('hidden', shouldHide);
        CoreEvent.dispatchEvent('fr-visibility-updated', { uuid, visible: !shouldHide });
      });
    }

    // --- Delete Button ---
    const deleteBtn = itemElement.querySelector('.sl-button.delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = itemElement.dataset.uuid;
        const type = itemElement.dataset.type;
        DataProvider.removeFRDataWithUUID(type, uuid);
      });
    }
  }

  _updateLanguage() {
    // Update Channel Options
    const listItems = this.listSection.querySelectorAll('.selection-list-item');
    if(listItems) {
      listItems.forEach(item => {
        const uuid = item.dataset.uuid;
        const frData = DataProvider.getFRData(uuid);
        if (!frData) return;

        const select = item.querySelector('.sl-channels-select');
        if (select) {
          select.innerHTML = this._getChannelOptions(Object.keys(frData.channels), frData.dispChannel);
        }
      });
    }
  }

  // Return the main list element for moving
  static getElement() {
    if(!SelectionList.element) {
      SelectionList.element = new SelectionList();
    }
    return SelectionList.element;
  };
}

//export default SelectionList.getElement();
customElements.define('selection-list', SelectionList);