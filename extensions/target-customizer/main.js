import { DataProvider, GraphEngine, StringLoader } from "../../core.min.js";
import { targetCustomizerStyle, IconProvider } from "./target-customizer.styles.js";
import { Equalizer } from "./util/equalizer.js";

// Extension metadata for version compatibility
export const EXTENSION_METADATA = {
  name: 'target-customizer',
  version: '1.0.0',
  apiLevel: 1,
  coreMinVersion: '1.0.0',
  coreMaxVersion: '1.0.x',
  description: 'Target curve customization extension with filter support',
  author: 'potatosalad775'
};

export default class TargetCustomizer {
  constructor(config = {}) {
    this.config = config;
    this.customizableTargetList = this._getCustomizableTargetList() || [];
    this.availableFilters = this.config.FILTERS || [];

    this.currentTarget = new Map();
    this.observer = null;

    this._init();
  }

  _init() {
    this.selectionList = document.querySelector(".selection-list");

    // Add style to the container
    const style = document.createElement("style");
    style.textContent = targetCustomizerStyle;
    this.selectionList.appendChild(style);

    // Setup Event Listeners
    this._setupEventListeners();

    // Observer Setup
    if (this.observer) {
      // Disconnect previous observer if re-initializing
      this.observer.disconnect();
    }
    this.observer = new MutationObserver(this._handleMutations.bind(this));
    this.observer.observe(this.selectionList, {
      childList: true,
      subtree: true,
    }); // Observe the list container

    // Add current target to the container
    Array.from(DataProvider.getFRDataMap()).forEach(([uuid, obj]) => {
      if (this.customizableTargetList.includes(obj.identifier)) {
        // Add target to the current target list
        // Avoid duplicates
        if (!this.currentTarget.has(uuid)) {
          const initialFilter = this.config.INITIAL_TARGET_FILTERS.find(
            (target) => (target.name.endsWith(' Target') ? target.name : target.name + ' Target') === obj.identifier
          )?.filter;

          if (initialFilter) {
            // Initialize with configured filters and their initial values
            const filterData = {};
            const activeFilters = [];
            
            // Check which filters have initial values and add them as active
            this.availableFilters.forEach(filter => {
              if (initialFilter[filter.id] !== undefined && initialFilter[filter.id] !== 0) {
                filterData[filter.id] = initialFilter[filter.id];
                activeFilters.push(filter.id);
              }
            });

            this.currentTarget.set(uuid, {
              identifier: obj.identifier,
              filter: filterData,
              activeFilters: activeFilters,
            });
            // Update Target Data
            this._updateTargetData(uuid);
          } else {
            this.currentTarget.set(uuid, {
              identifier: obj.identifier,
              filter: {},
              activeFilters: [],
            });
          }
        }

        // Check if the parent element *already* exists in the DOM
        const existingParent = this.selectionList.querySelector(
          `.selection-list-item[data-uuid="${uuid}"]`
        );
        // Check if component not already added to prevent duplicates if _init runs multiple times
        if (
          existingParent &&
          !existingParent.querySelector(".target-control-component")
        ) {
          //console.log("Appending Target Control Component to existing item:", uuid);
          this._addTargetControlComponent(uuid);
        }
      }
    });

    // Update Labels in Graph
    GraphEngine.updateLabels();
  }

  _addTargetControlComponent(uuid) {
    const targetData = this.currentTarget.get(uuid);
    if (!targetData) {
      console.warn(`Target data for UUID ${uuid} not found when trying to add control component.`);
      return;
    }

    const targetControlParent = this.selectionList.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
    if (!targetControlParent) {
      console.warn(`Parent element for UUID ${uuid} not found when trying to append control component.`);
      return; // Parent disappeared or wasn't found
    }
    if (targetControlParent.querySelector('.target-control-component')) {
      //console.log(`Control component for UUID ${uuid} already exists. Skipping.`);
      return; // Already added
    }

    const targetControlComponent = document.createElement("div");
    targetControlComponent.className = "target-control-component tc-component-hidden";
    targetControlComponent.setAttribute("data-uuid", uuid);
    
    // Build the HTML structure
    targetControlComponent.innerHTML = `
      <div class="tc-container">
        ${this._buildFiltersSection(targetData)}
        ${this._buildProfileSection()}
      </div>
    `;

    // Append the new component to the parent
    targetControlParent.appendChild(targetControlComponent);

    // Add event listeners to the component
    this._addAllEventListeners(targetControlComponent);

    // Add target control component view toggle button
    const targetControlToggleBtn = document.createElement("button");
    targetControlToggleBtn.className = "tc-view-toggle-btn";
    targetControlToggleBtn.setAttribute("data-uuid", uuid);
    targetControlToggleBtn.innerHTML = `
      <svg class="tc-btn-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
      </svg>
      <span>${StringLoader.getString('extension.target-customizer.tc-button.view', 'Pref. Adjustment')}</span>
    `;

    // Add event listener to the toggle button
    targetControlToggleBtn.addEventListener("click", (e) => {
      if (targetControlComponent) {
        targetControlToggleBtn.classList.toggle("active");
        targetControlComponent.classList.toggle("tc-component-hidden");
      }
    });

    // Append the button to the parent
    targetControlParent.querySelector(".sl-item-leading").insertBefore(
      targetControlToggleBtn, 
      targetControlParent.querySelector(".sl-item-leading").firstChild
    );

    // Update the baseline button
    this._updateBaselineButton(uuid);
  }

  _buildFiltersSection(targetData) {
    const activeFiltersHtml = targetData.activeFilters.length > 0 
      ? targetData.activeFilters.map(filterId => this._buildFilterControl(filterId, targetData)).join('')
      : `<div class="tc-no-filters">${StringLoader.getString('extension.target-customizer.tc-filter.no-filters', 'No filters active')}</div>`;

    const addFilterHtml = this._buildAddFilterSelect(targetData.activeFilters);

    return `
      <div class="tc-filters-section">
        <h4 class="tc-section-title">${StringLoader.getString('extension.target-customizer.tc-filter.active', 'Active Filters')}</h4>
        <div class="tc-active-filters">
          ${activeFiltersHtml}
        </div>
        ${addFilterHtml}
      </div>
    `;
  }

  _buildFilterControl(filterId, targetData) {
    const filter = this.availableFilters.find(f => f.id === filterId);
    if (!filter) return '';

    const value = targetData.filter[filterId] || 0;
    const label = StringLoader.getString(`extension.target-customizer.tc-label.${filterId}`, filter.name);
    const description = StringLoader.getString(`extension.target-customizer.tc-description.${filterId}`, filter.description);
    
    // Special handling for tilt filter
    const minValue = filterId === 'tilt' ? -10 : -20;
    const maxValue = filterId === 'tilt' ? 10 : 20;
    const stepValue = filterId === 'tilt' ? 0.1 : 0.1;

    return `
      <div class="tc-filter-control" data-filter-id="${filterId}">
        <div class="tc-filter-header">
          <span class="tc-filter-label">${label}</span>
          <button class="tc-remove-filter-btn" data-filter-id="${filterId}">×</button>
        </div>
        ${description ? `<div class="tc-filter-description">${description}</div>` : ''}
        <div class="tc-input">
          <input type="number" min="${minValue}" max="${maxValue}" value="${value}" step="${stepValue}" class="tc-input" data-type="${filterId}">
          <button class="tc-input-btn-dec" data-target="${filterId}">−</button>
          <button class="tc-input-btn-inc" data-target="${filterId}">+</button>
        </div>
      </div>
    `;
  }

  _buildAddFilterSelect(activeFilters) {
    const availableFilters = this.availableFilters.filter(filter => !activeFilters.includes(filter.id));
    
    if (availableFilters.length === 0) {
      return '';
    }

    const optionsHtml = availableFilters.map(filter => {
      const label = StringLoader.getString(`extension.target-customizer.tc-label.${filter.id}`, filter.name);
      return `<option value="${filter.id}">${label}</option>`;
    }).join('');

    return `
      <div class="tc-filter-management">
        <div class="tc-add-filter-container">
          <select class="tc-add-filter-select">
            <option value="">${StringLoader.getString('extension.target-customizer.tc-filter.add-placeholder', 'Add a filter...')}</option>
            ${optionsHtml}
          </select>
        </div>
      </div>
    `;
  }

  _buildProfileSection() {
    return `
      <div class="tc-profile-container">
        <h4 class="tc-section-title">${StringLoader.getString('extension.target-customizer.tc-profile.title', 'Filter Profiles')}</h4>
        <div class="tc-profile-controls">
          <div class="tc-profile-select-container">
            <select class="tc-profile-select">
              <option value="">
                ${StringLoader.getString('extension.target-customizer.tc-profile.placeholder', 'Select filter profile')}
              </option>
            </select>
          </div>
          <button class="tc-filter-reset-btn">${StringLoader.getString('extension.target-customizer.tc-button.reset', 'Reset')}</button>
        </div>
      </div>
    `;
  }

  _setupEventListeners() {
    window.addEventListener("core:fr-target-added", this._handleTargetAdded.bind(this));
    window.addEventListener("core:fr-target-removed", this._handleTargetRemoved.bind(this));
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  _handleTargetAdded(e) {
    const uuid = e.detail.uuid;
    const obj = DataProvider.getFRData(uuid);
    if (obj && this.customizableTargetList.includes(obj.identifier)) {
      // Add to our tracking map if not already present
      if (!this.currentTarget.has(uuid)) {
        const initialFilter = this.config.INITIAL_TARGET_FILTERS.find(
          (target) => (target.name.endsWith(' Target') ? target.name : target.name + ' Target') === obj.identifier
        )?.filter;

        if (initialFilter) {
          // Initialize with configured filters and their initial values
          const filterData = {};
          const activeFilters = [];
          
          // Check which filters have initial values and add them as active
          this.availableFilters.forEach(filter => {
            if (initialFilter[filter.id] !== undefined && initialFilter[filter.id] !== 0) {
              filterData[filter.id] = initialFilter[filter.id];
              activeFilters.push(filter.id);
            }
          });

          this.currentTarget.set(uuid, {
            identifier: obj.identifier,
            filter: filterData,
            activeFilters: activeFilters,
          });
          // Update Target Data
          this._updateTargetData(uuid);
        } else {
          this.currentTarget.set(uuid, {
            identifier: obj.identifier,
            filter: {},
            activeFilters: [],
          });
        }
      }

      // Check if the parent element already exists in the DOM *now*
      if (this.selectionList) {
        const parentItem = this.selectionList.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
        if (parentItem && !parentItem.querySelector('.target-control-component')) {
          // If parent exists but component doesn't, add it now
          //console.log("Adding control component from _handleTargetAdded for UUID:", uuid);
          this._addTargetControlComponent(uuid);
        } else if (!parentItem) {
          //console.log("Parent item not found yet for added target:", uuid, ". Observer should handle it.");
        }
      }
      // If parent doesn't exist yet, the MutationObserver should handle it when it's added.
    }
  }

  _handleTargetRemoved(e) {
    const uuid = e.detail.uuid;
    //console.log('Target Removed event for UUID:', uuid);
    // Remove from our tracking map
    const deleted = this.currentTarget.delete(uuid);
    if (deleted) {
      //console.log('Removed target from currentTarget map:', uuid);
    }
  }

  _addAllEventListeners(component) {
    // Populate filter preset options
    this.config.FILTER_PRESET.forEach((filter) => {
      const option = document.createElement("option");
      option.value = filter.name;
      option.textContent = filter.name;
      component.querySelector(".tc-profile-select").appendChild(option);
    });

    this._addInputEventListener(component);
    this._addFilterManagementEventListener(component);
    this._addSelectEventListener(component);
    this._addResetBtnEventListener(component);
  }

  _addInputEventListener(component) {
    const incButtons = component.querySelectorAll(".tc-input-btn-inc");
    const decButtons = component.querySelectorAll(".tc-input-btn-dec");
    const inputs = component.querySelectorAll("input[type='number'].tc-input");

    const btnAction = (button, action) => {
      const target = button.dataset.target;
      const input = button.parentNode.querySelector(`input[data-type="${target}"]`);
      const step = parseFloat(input.step) || 0.1; // Ensure step is a number
      const currentValue = parseFloat(input.value) || 0; // Handle potential NaN
      const newValue = action === 'inc' 
        ? (currentValue + step).toFixed(1) : (currentValue - step).toFixed(1);
      // Clamp value within min/max
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      input.value = Math.max(min, Math.min(max, parseFloat(newValue)));
      // Manually trigger the change event after button click
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const setupLongPress = (button, action) => {
      let pressTimer;
      let isPressed = false;
      button.addEventListener('mousedown', () => {
          isPressed = true;
          btnAction(button, action);
          pressTimer = setInterval(() => { if (isPressed) btnAction(button, action); }, 150);
      });
      const stopAction = () => {
          isPressed = false;
          clearInterval(pressTimer);
      };
      button.addEventListener('mouseup', stopAction);
      button.addEventListener('mouseleave', stopAction);
    };

    incButtons.forEach((button) => {
      button.addEventListener("click", () => btnAction(button, 'inc'));
      setupLongPress(button, 'inc');
    });

    decButtons.forEach((button) => {
      button.addEventListener("click", () => btnAction(button, 'dec'));
      setupLongPress(button, 'dec');
    });

    inputs.forEach((input) => {
      input.addEventListener("click", () => {
        // Select value on click
        input.select();
      });

      input.addEventListener("change", () => {
        const uuid = input
          .closest(".target-control-component")
          .getAttribute("data-uuid");
        const filterType = input.dataset.type;
        let value = parseFloat(input.value);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        // Validate and clamp the value
        if (isNaN(value)) {
          // If input is not a valid number, revert to the last known value
          value = this.currentTarget.get(uuid)?.filter?.[filterType] ?? 0;
        } else {
          // Clamp the value within the defined min and max
          value = Math.max(min, Math.min(max, value));
        }

        const formattedValue = value.toFixed(1); // Format to 1 decimal place
        input.value = formattedValue; // Update input display value with validated/formatted value

        // Update the internal state only if the value is valid
        if (this.currentTarget.has(uuid)) {
          const currentData = this.currentTarget.get(uuid);
          this.currentTarget.set(uuid, {
            ...currentData, // Keep existing identifier and other filters
            filter: {
              ...currentData.filter,
              [filterType]: formattedValue,
            },
          });
          // Update Target Data in DataProvider and redraw graph
          this._updateTargetData(uuid);
          GraphEngine.updateLabels();
        } else {
          console.warn(`Target data for UUID ${uuid} not found during input change.`);
        }
      });
    });
  }

  _addFilterManagementEventListener(component) {
    // Add filter select
    const addFilterSelect = component.querySelector('.tc-add-filter-select');
    if (addFilterSelect) {
      addFilterSelect.addEventListener('change', (e) => {
        const filterId = e.target.value;
        if (filterId) {
          const uuid = component.getAttribute('data-uuid');
          this._addFilter(uuid, filterId);
          e.target.value = ''; // Reset select
        }
      });
    }
    
    // Remove filter buttons
    component.addEventListener('click', (e) => {
      if (e.target.matches('.tc-remove-filter-btn')) {
        const filterId = e.target.dataset.filterId;
        const uuid = component.getAttribute('data-uuid');
        this._removeFilter(uuid, filterId);
      }
    });
  }

  _addFilter(uuid, filterId) {
    const targetData = this.currentTarget.get(uuid);
    if (!targetData) return;

    // Add filter to active filters if not already present
    if (!targetData.activeFilters.includes(filterId)) {
      targetData.activeFilters.push(filterId);
      targetData.filter[filterId] = 0; // Initialize with 0 value
      
      // Update the UI
      this._refreshFiltersSection(uuid);
      this._updateTargetData(uuid);
      GraphEngine.updateLabels();
    }
  }

  _removeFilter(uuid, filterId) {
    const targetData = this.currentTarget.get(uuid);
    if (!targetData) return;

    // Remove filter from active filters
    const filterIndex = targetData.activeFilters.indexOf(filterId);
    if (filterIndex > -1) {
      targetData.activeFilters.splice(filterIndex, 1);
      delete targetData.filter[filterId];
      
      // Update the UI
      this._refreshFiltersSection(uuid);
      this._updateTargetData(uuid);
      GraphEngine.updateLabels();
    }
  }

  _refreshFiltersSection(uuid) {
    const component = this.selectionList.querySelector(`.target-control-component[data-uuid="${uuid}"]`);
    const filtersSection = component.querySelector('.tc-filters-section');
    const targetData = this.currentTarget.get(uuid);
    
    if (filtersSection && targetData) {
      filtersSection.innerHTML = `
        <h4 class="tc-section-title">${StringLoader.getString('extension.target-customizer.tc-filter.active', 'Active Filters')}</h4>
        <div class="tc-active-filters">
          ${targetData.activeFilters.length > 0 
            ? targetData.activeFilters.map(filterId => this._buildFilterControl(filterId, targetData)).join('')
            : `<div class="tc-no-filters">${StringLoader.getString('extension.target-customizer.tc-filter.no-filters', 'No filters active')}</div>`
          }
        </div>
        ${this._buildAddFilterSelect(targetData.activeFilters)}
      `;
      
      // Re-add event listeners for the new elements
      this._addInputEventListener(component);
      this._addFilterManagementEventListener(component);
    }
  }

  _addSelectEventListener(component) {
    const select = component.querySelector("select.tc-profile-select");
    select.addEventListener("change", () => {
      const uuid = select
       .closest(".target-control-component")
       .getAttribute("data-uuid");
      const selectedProfile = select.value;
      if (selectedProfile === "") return; // Do nothing if no profile is selected
      
      // Find the selected profile in the FILTER_PRESET
      const selectedProfileData = this.config.FILTER_PRESET.find(
        (profile) => profile.name === selectedProfile
      );
      if (!selectedProfileData) {
        console.warn(`Profile ${selectedProfile} not found in FILTER_PRESET.`);
        return;
      }
      
      const targetData = this.currentTarget.get(uuid);
      if (!targetData) return;

      // Apply the selected profile's filters to the target
      const newFilter = {};
      const newActiveFilters = [];

      // Add filters that have non-zero values in the profile
      this.availableFilters.forEach(filter => {
        if (selectedProfileData.filter[filter.id] !== undefined && selectedProfileData.filter[filter.id] !== 0) {
          newFilter[filter.id] = selectedProfileData.filter[filter.id];
          newActiveFilters.push(filter.id);
        }
      });

      this.currentTarget.set(uuid, {
        ...targetData,
        filter: newFilter,
        activeFilters: newActiveFilters,
      });

      // Refresh the entire component to reflect changes
      this._refreshComponent(uuid);
      
      // Update Target Data in DataProvider and redraw graph
      this._updateTargetData(uuid);
      GraphEngine.updateLabels();
    })
  }

  _addResetBtnEventListener(component) {
    const resetBtn = component.querySelector(".tc-filter-reset-btn");
    resetBtn.addEventListener("click", () => {
      const uuid = resetBtn
       .closest(".target-control-component")
       .getAttribute("data-uuid");
       
      const targetData = this.currentTarget.get(uuid);
      if (!targetData) return;

      // Reset the target's filter to default
      this.currentTarget.set(uuid, {
        ...targetData,
        filter: {},
        activeFilters: [],
      });

      // Reset the select dropdown to default
      const select = component.querySelector("select.tc-profile-select");
      select.value = "";
      
      // Refresh the entire component
      this._refreshComponent(uuid);
      
      // Update Target Data in DataProvider and redraw graph
      this._updateTargetData(uuid);
      GraphEngine.updateLabels();
    })
  }

  _refreshComponent(uuid) {
    const component = this.selectionList.querySelector(`.target-control-component[data-uuid="${uuid}"]`);
    const targetData = this.currentTarget.get(uuid);
    
    if (component && targetData) {
      // Refresh filters section
      this._refreshFiltersSection(uuid);
    }
  }

  _updateTargetData(uuid) {
    const targetFilterData = this.currentTarget.get(uuid);
    if (targetFilterData === undefined) return;

    const targetData = DataProvider.getFRData(uuid);
    if (targetData === undefined) return;

    const equalizer = new Equalizer();
    
    // Build filters array from active filters (excluding tilt which is handled separately)
    const filters = targetFilterData.activeFilters
      .filter(filterId => filterId !== 'tilt')
      .map(filterId => {
        const filterConfig = this.availableFilters.find(f => f.id === filterId);
        if (!filterConfig) return null;
        
        return {
          type: filterConfig.type,
          freq: filterConfig.freq,
          q: filterConfig.q,
          gain: targetFilterData.filter[filterId] || 0
        };
      }).filter(filter => filter !== null);

    // Process each channel
    const channelData = {};
    const channelKeys = Object.keys(targetData.channels);

    // Apply Filters for each Channel Data
    channelKeys.forEach((channel) => {
      if (targetData.channels[channel]) {
        // TODO: Find a way to save original, unmodified data and apply filters on top of it
        // Apply EQ
        let filteredData = [];
        if (targetData.dispSuffix === "") {
          // No Suffix = Not filtered, use original data
          filteredData = equalizer.applyFilters(
            targetData.channels[channel].data,
            filters
          );
        } else {
          // Suffix = Filtered, use original data from metadata
          filteredData = equalizer.applyFilters(
            targetData.meta?.extensionData?.ogChannels[channel].data,
            filters
          );
        }
        // Apply Tilt (special handling)
        const tiltValue = targetFilterData.filter.tilt || 0;
        const tiltData = filteredData.map((f, i) => [
          f[0], f[1] + tiltValue * Math.log2(f[0]),
        ]);
        // Update Channel Data
        channelData[channel] = {
          data: tiltData,
          metadata: { ...targetData.channels[channel].metadata },
        };
      }
    });

    // Get display suffix
    let dispSuffix = "";
    
    // Add suffix for active filters
    targetFilterData.activeFilters.forEach(filterId => {
      const filterConfig = this.availableFilters.find(f => f.id === filterId);
      const value = targetFilterData.filter[filterId];
      if (filterConfig && parseFloat(value) !== 0) {
        if (filterId === 'tilt') {
          dispSuffix += `${filterConfig.name}: ${`${value}`.replace('.0', '')}dB/oct `;
        } else {
          dispSuffix += `${filterConfig.name}: ${`${value}`.replace('.0', '')}dB `;
        }
      }
    });

    // Update current EQ curve
    const updateData = {
      dispSuffix: dispSuffix !== "" ? `(${dispSuffix.trimEnd()})` : "",
    };

    // Only add meta if conditions are met
    if (targetData.dispSuffix === "" && targetData.meta?.extensionData?.ogChannels === undefined) {
      updateData.meta = {
        ...targetData.meta,
        extensionData: {
          ...targetData.meta?.extensionData,
          ogChannels: targetData.channels
        },
      };
    }

    DataProvider.updateFRDataWithRawData(uuid, channelData, updateData);
  }

  _updateBaselineButton(uuid) {
    const targetControlParent = this.selectionList.querySelector(`.selection-list-item[data-uuid="${uuid}"]`);
    if (!targetControlParent) {
      console.warn(`Parent element for UUID ${uuid} not found when trying to update baseline button.`);
      return; // Parent disappeared or wasn't found
    }
    const baselineButton = targetControlParent.querySelector(".sl-button.baseline");
    if (!baselineButton) {
      console.warn(`Baseline button not found for UUID ${uuid}.`);
      return; // Button not found
    }

    // Create new button element
    const newButtonElement = document.createElement("button");
    newButtonElement.className = `sl-button baseline`;
    newButtonElement.setAttribute("title", "Set as tilted baseline");
    newButtonElement.innerHTML = `${IconProvider.Icon('wave')}`;

    // Replace existing button with new one
    baselineButton.parentNode.replaceChild(newButtonElement, baselineButton);

    // Attach new event listener to the new button
    newButtonElement.addEventListener("click", (e) => {
      e.preventDefault();
      const button = e.currentTarget;
      const btnStatus = Array.from(button.classList).find((cName) => 
        ['tilted', 'flat'].includes(cName)) || 'disabled';
      const filterData = this.currentTarget.get(uuid).filter;

      // Update baseline data based on button state and baseline state
      if (btnStatus === 'disabled') {
        if (filterData.tilt !== 0) {
          // Draw tilted baseline = use unmodified data
          GraphEngine.updateBaselineData(true, { 
            uuid: uuid, channelData: DataProvider.getFRData(uuid).meta?.extensionData?.ogChannels['AVG'].data
          });
        } else {
          // Draw flat baseline = use modified data
          GraphEngine.updateBaselineData(true, { uuid: uuid });
        }
      } else if (btnStatus === 'tilted') {
        // Use modified data = resulting flat baseline
        GraphEngine.updateBaselineData(true, { uuid: uuid });
      } else if (btnStatus === 'flat') {
        // Disable baseline
        GraphEngine.updateBaselineData(false, { uuid: uuid });
      } else {
        console.error(`Unknown button status: ${btnStatus}`);
      }

      // Update *all* baseline buttons in the list
      this.selectionList.querySelectorAll('.sl-button.baseline').forEach(btn => {
        if (btn === button) { // Current button
          if (btnStatus === 'disabled') {
            if (filterData.tilt!== 0) {
              // Change to 'It's tilted' icon
              btn.innerHTML = IconProvider.Icon('tilted');
              btn.classList.add('active', 'tilted');
              // It should set flat baseline on click
              btn.setAttribute('title', 'Set as flat baseline');
            } else {
              // Change to 'It's flat' icon
              btn.innerHTML = IconProvider.Icon('flatline');
              btn.classList.remove('tilted');
              btn.classList.add('active', 'flat');
              // It should disable baseline on click
              btn.setAttribute('title', 'Reset Baseline');
            }
          } else if (btnStatus === 'tilted') {
            // Change to 'It's flat' icon
            btn.innerHTML = IconProvider.Icon('flatline');
            btn.classList.remove('tilted');
            btn.classList.add('active', 'flat');
            // It should disable baseline on click
            btn.setAttribute('title', 'Reset Baseline');
          } else if (btnStatus === 'flat') {
            // Change to 'It's not baseline atm' icon
            btn.innerHTML = IconProvider.Icon('wave');
            btn.classList.remove('active', 'flat', 'tilted');
            // It should set tilted baseline on click
            btn.setAttribute('title', 'Set as tilted baseline');
          } else {
            console.error(`Unknown button status: ${btnStatus}`);
          }
        } else { // Other buttons
          if (btnStatus === 'disabled') { // If we just activated one, deactivate others
            btn.classList.remove('active', 'flat', 'tilted');
            btn.setAttribute('title', 'Set Baseline');
            btn.innerHTML = IconProvider.Icon('wave');
          }
        }
      });
    });
  }

  _handleMutations(mutationsList, observer) {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          // Check if the added node itself is the list item we are looking for
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.matches(".selection-list-item")
          ) {
            const uuid = node.getAttribute("data-uuid");
            // Check if this is a target we care about and if the control isn't already added
            if (
              uuid && this.currentTarget.has(uuid) &&
              !node.querySelector(".target-control-component")
            ) {
              //console.log("Appending Target Control Component via MutationObserver:", uuid);
              this._addTargetControlComponent(uuid);
            }
          }
          // Also check if the added node *contains* the target list item (e.g., if items are wrapped)
          else if (node.nodeType === Node.ELEMENT_NODE && node.querySelector) {
            const targetItem = node.querySelector(`.selection-list-item`); // More general check inside added node
            if(targetItem) {
              const uuid = targetItem.getAttribute('data-uuid');
              if (uuid && this.currentTarget.has(uuid) && !targetItem.querySelector('.target-control-component')) {
                //console.log("Appending Target Control Component via MutationObserver (nested):", uuid);
                this._addTargetControlComponent(uuid);
              }
            }
          }
        });
      }
    }
  }

  _updateLanguage() {
    // Update View Toggle Button Label
    const viewToggleBtn = this.selectionList.querySelectorAll(".tc-view-toggle-btn");
    if(viewToggleBtn) {
      viewToggleBtn.forEach((btn) => {
        btn.innerHTML = `
          <svg class="tc-btn-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
          <span>${StringLoader.getString('extension.target-customizer.tc-button.view', 'Pref. Adjustment')}</span>
        `;
      });
    }
    
    // Update Target Control Components
    const targetCtrlComponents = this.selectionList.querySelectorAll(".target-control-component");
    if(targetCtrlComponents) {
      targetCtrlComponents.forEach((component) => {
        const uuid = component.getAttribute('data-uuid');
        this._refreshComponent(uuid);
      });
    }
  }

  _getCustomizableTargetList() {
    return this.config.CUSTOMIZABLE_TARGETS.map((name) =>
      name.endsWith(" Target") ? name : name + " Target"
    );
  }
}