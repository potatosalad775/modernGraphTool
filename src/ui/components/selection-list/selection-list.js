import DataProvider from "../../../model/data-provider.js";
import CoreEvent from "../../../core-event.js";
import RenderEngine from "../../visualization/render-engine.js";
import StringLoader from "../../../model/util/string-loader.js";
import { selectionListStyles } from "./selection-list.styles.js";
import { IconProvider } from "../../../styles/icon-provider.js";

class SelectionList extends HTMLElement {
  constructor() {
    super();
    //this.attachShadow({ mode: 'open' });
    this._boundUpdateList = this._updateList.bind(this);
  }

  connectedCallback() {
    window.addEventListener('core:fr-phone-added', this._boundUpdateList);
    window.addEventListener('core:fr-phone-removed', this._boundUpdateList);
    window.addEventListener('core:fr-target-added', this._boundUpdateList);
    window.addEventListener('core:fr-target-removed', this._boundUpdateList);
    window.addEventListener('core:fr-unknown-inserted', this._boundUpdateList);
    window.addEventListener('core:fr-unknown-removed', this._boundUpdateList);
    window.addEventListener('core:fr-variant-updated', this._boundUpdateList);
    StringLoader.addObserver(this._updateLanguage.bind(this));
    this._updateList();
  }

  disconnectedCallback() {
    window.removeEventListener('core:fr-phone-added', this._boundUpdateList);
    window.removeEventListener('core:fr-phone-removed', this._boundUpdateList);
    window.removeEventListener('core:fr-target-added', this._boundUpdateList);
    window.removeEventListener('core:fr-target-removed', this._boundUpdateList);
    window.removeEventListener('core:fr-unknown-inserted', this._boundUpdateList);
    window.removeEventListener('core:fr-unknown-removed', this._boundUpdateList);
    window.removeEventListener('core:fr-variant-updated', this._boundUpdateList);
    StringLoader.removeObserver(this._updateLanguage.bind(this));
  }

  _updateList() {
    const newState = Array.from(DataProvider.frDataMap);
    if (JSON.stringify(this._lastState) === JSON.stringify(newState)) return;

    // Only update DOM if data actually changed
    this._lastState = newState;

    this.innerHTML = `
      <style>${selectionListStyles}</style>
      <section class="selection-list">
        ${Array.from(DataProvider.frDataMap)
          .sort(([, a], [, b]) => a.type === 'target' ? -1 : b.type === 'target' ? 1 : 0)
          .map(([uuid, frData]) => {
            return `
            <div class="selection-list-item" data-uuid="${uuid}" data-type="${frData.type}">
              <div class="sl-item-content">
                <div class="sl-item-heading">
                  <button class="sl-color-btn" style="background: ${frData.colors.L || frData.colors}"></button>
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
                      <button class="sl-button visibility" title="Hide Graph">${IconProvider.Icon('eyeOn', 'width: 1.5rem; height: 1.5rem;')}</button>
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
            </div>`;
          }).join('')}
      </section>
    `;
    this._attachEventListeners();
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

  _attachEventListeners() {
    // Color Button
    this.querySelectorAll('.sl-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const type = e.target.closest('.selection-list-item').dataset.type;
        const newColor = DataProvider._getColorWithType(type);

        // Change target with random color
        DataProvider.updateMetadata('uuid', uuid, 'colors', newColor);
        btn.style.background = newColor.L || newColor;
      });
    });

    // Variant Select Menu Button
    this.querySelectorAll('.sl-variant-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        const button = e.currentTarget;
        const variantMenu = e.target.closest('.selection-list-item').querySelector('.sl-variant-menu');
        
        // Toggle visibility state
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
    });

    // Variant Item Button
    this.querySelectorAll('.sl-variant-item').forEach(selector => {
      // Switch to Variant
      selector.addEventListener('click', async (e) => {
        e.preventDefault();

        const variantMenu = e.target.closest('.sl-variant-menu');
        variantMenu.setAttribute('aria-busy', 'true');

        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const index = e.target.closest('.sl-variant-item').dataset.index;
        const dataMap = DataProvider.getFRData(uuid);

        DataProvider.updateVariant(uuid, dataMap.meta.files[parseInt(index)].suffix);
        variantMenu.setAttribute('aria-busy', 'false');
      });

      // Add Variant Button
      selector.querySelector('.sl-button.add-variant').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent event from bubbling up to parent (Switch Variant)
        
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const index = e.target.closest('.sl-variant-item').dataset.index;
        const dataMap = DataProvider.getFRData(uuid);

        DataProvider.addFRData('phone', dataMap.identifier, {
          dispSuffix: dataMap.meta.files[parseInt(index)].suffix
        });
      });
    });

    // Channel Select Menu
    this.querySelectorAll('.sl-channels').forEach(selector => {
      selector.addEventListener('change', (e) => {
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const channel = { "L": ["L"], "R": ["R"], "L+R": ["L", "R"], "AVG": ["AVG"] }

        DataProvider.updateMetadata('uuid', uuid, 'dispChannel', channel[e.target.value]);
      });
    });

    // Y-Offset Input
    this.querySelectorAll('.sl-y-offset').forEach(input => {
      input.addEventListener('input', (e) => {
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const offset = parseFloat(e.target.value) || 0;
        const curves = document.querySelectorAll(`.fr-graph-curve-container path[uuid='${uuid}']`);

        curves.forEach(curve => {
          curve.setAttribute('transform', `translate(0,${0 - offset})`);
        });
      });
    });

    // Y-offset Decrement Button with long press support
    this.querySelectorAll('.sl-y-offset-dec').forEach(decBtn => {
      let pressTimer;
      let isPressed = false;

      const decrementValue = (parentDiv) => {
        const input = parentDiv.querySelector('.sl-y-offset-input');
        input.value = parseInt(input.value) - 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      decBtn.addEventListener('mousedown', (e) => {
        const parentDiv = e.currentTarget.closest('.sl-y-offset');
        isPressed = true;
        decrementValue(parentDiv);
        
        pressTimer = setInterval(() => {
          if (isPressed) {
            decrementValue(parentDiv);
          }
        }, 150);
      });

      decBtn.addEventListener('mouseup', () => {
        isPressed = false;
        clearInterval(pressTimer);
      });

      decBtn.addEventListener('mouseleave', () => {
        isPressed = false;
        clearInterval(pressTimer);
      });
    });

    // Y-offset Increment Button with long press support
    this.querySelectorAll('.sl-y-offset-inc').forEach(incBtn => {
      let pressTimer;
      let isPressed = false;

      const incrementValue = (parentDiv) => {
        const input = parentDiv.querySelector('.sl-y-offset-input');
        input.value = parseInt(input.value) + 1;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };

      incBtn.addEventListener('mousedown', (e) => {
        const parentDiv = e.currentTarget.closest('.sl-y-offset');
        isPressed = true;
        incrementValue(parentDiv);
        
        pressTimer = setInterval(() => {
          if (isPressed) {
            incrementValue(parentDiv);
          }
        }, 150);
      });

      incBtn.addEventListener('mouseup', () => {
        isPressed = false;
        clearInterval(pressTimer);
      });

      incBtn.addEventListener('mouseleave', () => {
        isPressed = false;
        clearInterval(pressTimer);
      });
    });

    // Baseline Button
    this.querySelectorAll('.sl-button.baseline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        const button = e.currentTarget;
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const isActive = button.classList.contains('active');
        
        // Toggle visibility state
        RenderEngine.updateBaseline(uuid, true);

        if (!isActive) {
          button.setAttribute('title', 'Reset Baseline');
          button.innerHTML = IconProvider.Icon('flatline', 'width: 1.5rem; height: 1.5rem;');
          // Reset Baseline for all other buttons
          this.querySelectorAll('.sl-button.baseline').forEach(button => {
            if (button !== e.currentTarget) {
              button.classList.remove('active');
              button.setAttribute('title', 'Set Baseline');
              button.innerHTML = IconProvider.Icon('wave', 'width: 1.5rem; height: 1.5rem;');
            }
          });
        } else {
          button.setAttribute('title', 'Set Baseline');
          button.innerHTML = IconProvider.Icon('wave', 'width: 1.5rem; height: 1.5rem;');
        }
        button.classList.toggle('active', !isActive);
      });
    });

    // Visibility Button
    this.querySelectorAll('.sl-button.visibility').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();

        const button = e.currentTarget;
        const uuid = button.closest('.selection-list-item').dataset.uuid;
        const dataObj = DataProvider.getFRData(uuid);
        const curves = document.querySelectorAll(`.fr-graph-curve-container path[uuid='${uuid}']`);
        
        // Toggle visibility state
        const shouldHide = !button.classList.contains('hidden');
        dataObj.hidden = shouldHide;
        
        if (shouldHide) {
          curves.forEach(curve => {
            curve.style.display = 'none';
          });
          button.setAttribute('title', 'Show Graph');
          button.innerHTML = IconProvider.Icon('eyeOff', 'width: 1.5rem; height: 1.5rem;');
        } else {
          curves.forEach(curve => {
            curve.style.display = '';
          });
          button.setAttribute('title', 'Hide Graph');
          button.innerHTML = IconProvider.Icon('eyeOn', 'width: 1.5rem; height: 1.5rem;');
        }

        button.classList.toggle('hidden', shouldHide);

        CoreEvent.dispatchEvent('fr-visibility-updated');
      });
    });

    // Delete Button
    this.querySelectorAll('.sl-button.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        
        const uuid = e.target.closest('.selection-list-item').dataset.uuid;
        const type = e.target.closest('.selection-list-item').dataset.type;
        DataProvider.removeFRDataWithUUID(type, uuid);
      });
    });
  }

  _updateLanguage() {
    // Update Channel Options
    Array.from(DataProvider.frDataMap)
      .sort(([, a], [, b]) => a.type === 'target' ? -1 : b.type === 'target' ? 1 : 0)
      .map(([uuid, frData]) => {
        const item = this.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
        const select = item.querySelector('.sl-channels-select') || null;
        if(select) {
          select.innerHTML = this._getChannelOptions(Object.keys(frData.channels), frData.dispChannel);
        }
      });
  }
}

customElements.define('selection-list', SelectionList);