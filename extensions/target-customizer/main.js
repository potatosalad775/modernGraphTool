import { DataProvider, RenderEngine, StringLoader } from "../../core.min.js";
import { targetCustomizerStyle, IconProvider } from "./target-customizer.styles.js";
import { Equalizer } from "./util/equalizer.js";

export default class TargetCustomizer {
  constructor(config = {}) {
    this.config = config;
    this.customizableTargetList = this._getCustomizableTargetList() || [];

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
            this.currentTarget.set(uuid, {
              identifier: obj.identifier,
              filter: { 
                tilt: initialFilter.tilt || 0, 
                bass: initialFilter.bass || 0, 
                treble: initialFilter.treble || 0, 
                ear: initialFilter.ear || 0 
              },
            });
            // Update Target Data
            this._updateTargetData(uuid);
          } else {
            this.currentTarget.set(uuid, {
              identifier: obj.identifier,
              filter: { tilt: 0, bass: 0, treble: 0, ear: 0 },
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
    RenderEngine.updateLabels();
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
    targetControlComponent.innerHTML = `
      <div class="tc-container">
        <div class="tc-input-group">
          <label>${StringLoader.getString('extension.target-customizer.tc-label.tilt', 'Tilt (dB/oct)')}</label>
          <div class="tc-input">
            <input type="number" min="-10" max="10" value=${targetData.filter.tilt} step="0.1" class="tc-input" data-type="tilt">
            <button class="tc-input-btn-dec">−</button>
            <button class="tc-input-btn-inc">+</button>
          </div>
        </div>
        <div class="tc-input-group">
          <label>${StringLoader.getString('extension.target-customizer.tc-label.bass', 'Bass (dB)')}</label>
          <div class="tc-input">
            <input type="number" min="-20" max="20" value=${targetData.filter.bass} step="1" class="tc-input" data-type="bass">
            <button class="tc-input-btn-dec">−</button>
            <button class="tc-input-btn-inc">+</button>
          </div>
        </div>
        <div class="tc-input-group">
          <label>${StringLoader.getString('extension.target-customizer.tc-label.treble', 'Treble (dB)')}</label>
          <div class="tc-input">
            <input type="number" min="-20" max="20" value=${targetData.filter.treble} step="0.1" class="tc-input" data-type="treble">
            <button class="tc-input-btn-dec">−</button>
            <button class="tc-input-btn-inc">+</button>
          </div>
        </div>
        <div class="tc-input-group">
          <label>${StringLoader.getString('extension.target-customizer.tc-label.eargain', 'Ear Gain (dB)')}</label>
          <div class="tc-input">
            <input type="number" min="-20" max="20" value=${targetData.filter.ear} step="0.1" class="tc-input" data-type="ear">
            <button class="tc-input-btn-dec">−</button>
            <button class="tc-input-btn-inc">+</button>
          </div>
        </div>
      </div>
      <div class="tc-profile-container">
        <div class="tc-profile-select-container">
          <select class="tc-profile-select">
            <option value="">
              ${StringLoader.getString('extension.target-customizer.tc-profile.placeholder', 'Select filter profile')}
            </option>
          </select>
        </div>
        <button class="tc-filter-reset-btn">${StringLoader.getString('extension.target-customizer.tc-button.reset', 'Reset')}</button>
      </div>
    `;

    // Append filter options 
    this.config.FILTER_SET.forEach((filter) => {
      const option = document.createElement("option");
      option.value = filter.name;
      option.textContent = filter.name;
      targetControlComponent.querySelector(".tc-profile-select").appendChild(option);
    });
    // Append the new component to the parent
    targetControlParent.appendChild(targetControlComponent);

    // Add event listeners to the component
    this._addInputEventListener(targetControlComponent);
    this._addSelectEventListener(targetControlComponent);
    this._addResetBtnEventListener(targetControlComponent);

    // Add target control component view toggle button
    const targetControlToggleBtn = document.createElement("button");
    targetControlToggleBtn.className = "tc-view-toggle-btn";
    targetControlToggleBtn.setAttribute("data-uuid", uuid);
    targetControlToggleBtn.innerHTML = `
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
          this.currentTarget.set(uuid, {
            identifier: obj.identifier,
            filter: { 
              tilt: initialFilter.tilt || 0, 
              bass: initialFilter.bass || 0, 
              treble: initialFilter.treble || 0, 
              ear: initialFilter.ear || 0 
            },
          });
          // Update Target Data
          this._updateTargetData(uuid);
        } else {
          this.currentTarget.set(uuid, {
            identifier: obj.identifier,
            filter: { tilt: 0, bass: 0, treble: 0, ear: 0 },
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

  _addInputEventListener(component) {
    const incButtons = component.querySelectorAll(".tc-input-btn-inc");
    const decButtons = component.querySelectorAll(".tc-input-btn-dec");
    const inputs = component.querySelectorAll("input[type='number'].tc-input");

    const btnAction = (button, action) => {
      const input = button.parentNode.querySelector("input");
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
      button.addEventListener("click", btnAction(button, 'inc'));
      setupLongPress(button, 'inc');
    });

    decButtons.forEach((button) => {
      button.addEventListener("click", btnAction(button, 'dec'));
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
          RenderEngine.updateLabels();
        } else {
          console.warn(`Target data for UUID ${uuid} not found during input change.`);
        }
      });
    });
  }

  _addSelectEventListener(component) {
    const select = component.querySelector("select.tc-profile-select");
    select.addEventListener("change", () => {
      const uuid = select
       .closest(".target-control-component")
       .getAttribute("data-uuid");
      const selectedProfile = select.value;
      if (selectedProfile === "") return; // Do nothing if no profile is selected
      // Find the selected profile in the FILTER_SET
      const selectedProfileData = this.config.FILTER_SET.find(
        (profile) => profile.name === selectedProfile
      );
      if (!selectedProfileData) {
        console.warn(`Profile ${selectedProfile} not found in FILTER_SET.`);
        return;
      }
      // Apply the selected profile's filters to the target
      this.currentTarget.set(uuid, {
        ...this.currentTarget.get(uuid),
        filter: {
          tilt: selectedProfileData.filter.tilt || 0,
          bass: selectedProfileData.filter.bass || 0,
          treble: selectedProfileData.filter.treble || 0,
          ear: selectedProfileData.filter.ear || 0,
        },
      });
      // Update the input fields with the selected profile's values
      const inputs = component.querySelectorAll("input[type='number'].tc-input");
      inputs.forEach((input) => {
        const filterType = input.dataset.type;
        input.value = selectedProfileData.filter[filterType] || 0;
      });
      // Update Target Data in DataProvider and redraw graph
      this._updateTargetData(uuid);
      RenderEngine.updateLabels();
    })
  }

  _addResetBtnEventListener(component) {
    const resetBtn = component.querySelector(".tc-filter-reset-btn");
    resetBtn.addEventListener("click", () => {
      const uuid = resetBtn
       .closest(".target-control-component")
       .getAttribute("data-uuid");
      // Reset the target's filter to default
      this.currentTarget.set(uuid, {
        ...this.currentTarget.get(uuid),
        filter: { tilt: 0, bass: 0, treble: 0, ear: 0 },
      })
      // Reset the input fields to default
      const inputs = component.querySelectorAll("input[type='number'].tc-input");
      inputs.forEach((input) => {
        input.value = 0;
      });
      // Reset the select dropdown to default
      const select = component.querySelector("select.tc-profile-select");
      select.value = "";
      // Update Target Data in DataProvider and redraw graph
      this._updateTargetData(uuid);
      RenderEngine.updateLabels();
    })
  }

  _updateTargetData(uuid) {
    const targetFilterData = this.currentTarget.get(uuid);
    if (targetFilterData === undefined) return;

    const targetData = DataProvider.getFRData(uuid);
    if (targetData === undefined) return;

    const equalizer = new Equalizer();
    const filters = [
      { type: "LSQ", freq: 105, q: 0.707, gain: targetFilterData.filter.bass || 0 },
      { type: "HSQ", freq: 2500, q: 0.42, gain: targetFilterData.filter.treble || 0 },
      { type: "PK", freq: 2750, q: 1, gain: targetFilterData.filter.ear || 0 },
    ];

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
            targetData.meta.ogChannels[channel].data,
            filters
          );
        }
        // Apply Tilt
        const tiltData = filteredData.map((f, i) => [
          f[0], f[1] + (targetFilterData.filter.tilt || 0) * Math.log2(f[0]),
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
    if (parseFloat(targetFilterData.filter.tilt) !== 0) {
      dispSuffix += `Tilt: ${`${targetFilterData.filter.tilt}`.replace('.0', '')}dB/oct `;
    }
    if (parseFloat(targetFilterData.filter.bass) !== 0) {
      dispSuffix += `Bass: ${`${targetFilterData.filter.bass}`.replace('.0', '')}dB `;
    }
    if (parseFloat(targetFilterData.filter.treble) !== 0) {
      dispSuffix += `Treble: ${`${targetFilterData.filter.treble}`.replace('.0', '')}dB `;
    }
    if (parseFloat(targetFilterData.filter.ear) !== 0) {
      dispSuffix += `Ear: ${`${targetFilterData.filter.ear}`.replace('.0', '')}dB `;
    }

    // Update current EQ curve
    DataProvider.updateFRDataWithRawData(uuid, channelData, {
      dispSuffix: dispSuffix !== "" ? `(${dispSuffix.trimEnd()})` : "",
      ...(targetData.dispSuffix === "" &&
        targetData.meta.ogChannels === undefined && {
          meta: {
            ...targetData.meta,
            ogChannels: targetData.channels,
          },
        }),
    });
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
          RenderEngine.updateBaselineData(true, { 
            uuid: uuid, channelData: DataProvider.getFRData(uuid).meta.ogChannels['AVG'].data
          });
        } else {
          // Draw flat baseline = use modified data
          RenderEngine.updateBaselineData(true, { uuid: uuid });
        }
      } else if (btnStatus === 'tilted') {
        // Use modified data = resulting flat baseline
        RenderEngine.updateBaselineData(true, { uuid: uuid });
      } else if (btnStatus === 'flat') {
        // Disable baseline
        RenderEngine.updateBaselineData(false, { uuid: uuid });
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
          <span>${StringLoader.getString('extension.target-customizer.tc-button.view', 'Pref. Adjustment')}</span>
        `;
      });
    }
    // Update Target Control Component
    const targetCtrlComponent = this.selectionList.querySelectorAll(".target-control-component");
    if(targetCtrlComponent) {
      targetCtrlComponent.forEach((component) => {
        // Update Input Labels
        const inputLabels = component.querySelectorAll(".tc-input-group label");
        inputLabels.forEach((input, index) => {
          if (index === 0) {
            input.innerHTML = StringLoader.getString('extension.target-customizer.tc-label.tilt', 'Tilt (dB/oct)');
          } else if (index === 1) {
            input.innerHTML = StringLoader.getString('extension.target-customizer.tc-label.bass', 'Bass (dB)');
          } else if (index === 2) {
            input.innerHTML = StringLoader.getString('extension.target-customizer.tc-label.treble', 'Treble (dB)');
          } else if (index === 3) {
            input.innerHTML = StringLoader.getString('extension.target-customizer.tc-label.ear', 'Ear Gain (dB)');
          } 
        });

        // Update Profile Select Placeholder Text
        const profilePlaceholder = component.querySelector(".tc-profile-select > option[value='']");
        profilePlaceholder.innerHTML = StringLoader.getString('extension.target-customizer.tc-profile.placeholder', 'Select filter profile');

        // Update Reset Button Text
        const resetBtn = component.querySelector(".tc-filter-reset-btn");
        resetBtn.innerHTML = StringLoader.getString('extension.target-customizer.tc-button.reset', 'Reset');
      });
    }
  }

  _getCustomizableTargetList() {
    return this.config.CUSTOMIZABLE_TARGETS.map((name) =>
      name.endsWith(" Target") ? name : name + " Target"
    );
  }
}