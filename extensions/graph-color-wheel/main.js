import { DataProvider, StringLoader } from "../../core.min.js";
import "./reinvented-color-wheel.min.js";
import { graphColorWheelStyle, gCWIconProvider } from "./graph-color-wheel.styles.js";

export default class GraphColorWheel {
  constructor(config = {}) {
    this.config = config;
    this.activePopup = null;
    this.activeUUID = null;
    this.activeType = null;
    this.selectionList = null;

    this._init();
  }

  _init() {
    this._injectStyles();
    this._updateSelectionList();

    // Add Event listener
    window.addEventListener("core:init-ready", this._updateSelectionList.bind(this));
    window.addEventListener("core:fr-phone-added", this._replaceOldButtonWithUUID.bind(this));
    window.addEventListener("core:fr-target-added", this._replaceOldButtonWithUUID.bind(this));
    window.addEventListener("core:fr-unknown-inserted", this._replaceOldButtonWithUUID.bind(this));
    window.addEventListener("core:menu-switched", (e) => {
      if(e.detail.target !== 'list' && this.activePopup) {
        // Close color picker if menu is switched
        this.activePopup.remove();
        this.activePopup = null;
      }
    })
    
    // Add StringLoader Observer
    StringLoader.addObserver(this._updateLanguage.bind(this));
  }

  _injectStyles() {
    const style = document.createElement("style");
    style.textContent = graphColorWheelStyle;
    document.body.appendChild(style);
  }

  _updateSelectionList() {
    if(this.selectionList) return; // Already updated
    
    // Find the selection list container
    this.selectionList = document.querySelector(".selection-list"); 
    if (!this.selectionList) {
      console.warn("Cannot find parent for color wheel.");
      return;
    }

    // Replace existing buttons (with old event listener)
    this.selectionList
      .querySelectorAll(".sl-color-btn")
      .forEach((btn) => {
        // Make replacement button
        this._replaceOldButton(btn);
      });
  }

  _replaceOldButton(button) {
    // Make replacement button
    const newBtn = document.createElement('button');
    newBtn.className = 'sl-color-btn';
    newBtn.style.background = button.style.background;
    this._attachListenerToButton(newBtn);
    // Replace old button with new one
    button.parentNode.replaceChild(newBtn, button);
  }

  _replaceOldButtonWithUUID(e) {
    const slButton = document.querySelector(
      `.selection-list-item[data-uuid="${e.detail.uuid}"] .sl-color-btn`
    );
    this._replaceOldButton(slButton);
  }

  _attachListenerToButton(button) {
    if (button.dataset.colorWheelAttached) return; // Avoid attaching multiple listeners

    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent other click listeners on the item

      const itemElement = e.target.closest("[data-uuid]");
      if (!itemElement) return;

      if(this.activePopup !== null && this.activeUUID === itemElement.dataset.uuid) {
        // If same color button is clicked again, close color picker.
        this.activePopup.remove();
        this.activePopup = null;
      } else {
        this.activeUUID = itemElement.dataset.uuid;
        this.activeType = itemElement.dataset.type;
        // Display color picker
        this._createOrShowPopup(e.target);
      }
    });
    button.dataset.colorWheelAttached = true;
  }

  _createOrShowPopup(targetButton) {
    if (this.activePopup) {
      this.activePopup.remove();
      this.activePopup = null;
    }

    const frData = DataProvider.getFRData(this.activeUUID);
    const colorStr = `${frData.colors.AVG}` || "hsl(0, 0%, 0%)"; // Default to black if no color
    const currentColor = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/).splice(1, 3);
    const currentDash = frData.dash.split(' ') || [null, null]; // Default to solid

    this.activePopup = document.createElement("div");
    this.activePopup.className = "graph-color-wheel-popup";
    this.activePopup.innerHTML = `
      <div class="color-wheel-section">
        <reinvented-color-wheel
          hsl=${currentColor},
          wheel-diameter="128",
          wheel-thickness="14",
          handle-diameter="16",
          wheel-reflects-saturation="true",
        ></reinvented-color-wheel>
      </div>
      <div class="input-section">
        <div class="popup-footer">
          <button id="gcw-random-color" title="Use random color">${gCWIconProvider.Icon('random')}</button>
          <button class="close-btn" title="Close color picker">${gCWIconProvider.Icon('close')}</button>
        </div>
        <div class="color-input-container">
          <div class="gcw-input-group">
            <label for="gcw-hsl-hue">
              ${StringLoader.getString("extension.graph-color-wheel.label.hue", "H")}
            </label>
            <input type="number" id="gcw-hsl-hue" value=${currentColor[0]} placeholder="Hue" 
              min="0" max="360" title="Hue value input">
          </div>
          <div class="gcw-input-group">
            <label for="gcw-hsl-sat">
              ${StringLoader.getString("extension.graph-color-wheel.label.saturation", "S")}
            </label>
            <input type="number" id="gcw-hsl-sat" value=${currentColor[1]} placeholder="Saturation"
              min="0" max="360" title="Saturation value input">
          </div>
          <div class="gcw-input-group">
            <label for="gcw-hsl-light">
              ${StringLoader.getString("extension.graph-color-wheel.label.lightness", "L")}
            </label>
            <input type="number" id="gcw-hsl-light" value=${currentColor[2]} placeholder="Lightness"
              min="0" max="360" title="Lightness value input">
          </div>
        </div>
        <div class="dash-input-container">
          <div class="gcw-input-group">
            <label for="gcw-tick-length">
              ${StringLoader.getString("extension.graph-color-wheel.label.tick", "Tick")}
            </label>
            <input type="number" id="gcw-tick-length" value="${currentDash[0] || ""}" placeholder="e.g., 6"
              title="Tick length input">
          </div>
          <div class="gcw-input-group">
            <label for="gcw-space-length">
              ${StringLoader.getString("extension.graph-color-wheel.label.space", "Space")}
            </label>
            <input type="number" id="gcw-space-length" value="${currentDash[1] || ""}" placeholder="e.g., 3"
              title="Space length input">
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.activePopup);

    this._positionPopup(targetButton);
    this._addPopupEventListeners();
  }

  _positionPopup(targetButton) {
    const rect = targetButton.getBoundingClientRect();
    this.activePopup.style.position = "absolute";
    if(window.innerWidth < 1000) {
      this.activePopup.style.top = `${rect.top + window.scrollY - 170}px`;
      this.activePopup.style.left = `${rect.right + window.scrollX - 24}px`;
    } else {
      this.activePopup.style.top = `${rect.top + window.scrollY - 170}px`;
      this.activePopup.style.left = `${rect.right + window.scrollX - 24}px`;
    }
  }

  _addPopupEventListeners() {
    const closeButton = this.activePopup.querySelector(".close-btn");
    const colorPicker = this.activePopup.querySelector("reinvented-color-wheel");
    const hslHueInput = this.activePopup.querySelector("#gcw-hsl-hue");
    const hslSatInput = this.activePopup.querySelector("#gcw-hsl-sat");
    const hslLightInput = this.activePopup.querySelector("#gcw-hsl-light");
    const tickInput = this.activePopup.querySelector("#gcw-tick-length");
    const spaceInput = this.activePopup.querySelector("#gcw-space-length");
    const randomColorButton = this.activePopup.querySelector("#gcw-random-color");

    closeButton.addEventListener("click", () => {
      this.activePopup.remove();
      this.activePopup = null;
    });

    colorPicker.addEventListener("change", (e) => {
      hslHueInput.value = e.detail.hsl[0];
      hslSatInput.value = e.detail.hsl[1];
      hslLightInput.value = e.detail.hsl[2];

      // Update Graph Color
      this._updateColor({
        h: parseInt(hslHueInput.value),
        s: parseInt(hslSatInput.value),
        l: parseInt(hslLightInput.value),
      })
    });

    hslHueInput.addEventListener("input", (e) => {
      let val = e.target.value;
      colorPicker.colorWheel.hsl = [val, colorPicker.colorWheel.hsl[1], colorPicker.colorWheel.hsl[2]];
    });

    hslSatInput.addEventListener("input", (e) => {
      let val = e.target.value;
      colorPicker.colorWheel.hsl = [colorPicker.colorWheel.hsl[0], val, colorPicker.colorWheel.hsl[2]];
    });

    hslLightInput.addEventListener("input", (e) => {
      let val = e.target.value;
      colorPicker.colorWheel.hsl = [colorPicker.colorWheel.hsl[0], colorPicker.colorWheel.hsl[1], val];
    });

    tickInput.addEventListener("input", () => {
      this._updateDash({tick: tickInput.value, space: spaceInput.value});
    })

    spaceInput.addEventListener("input", () => {
      this._updateDash({tick: tickInput.value, space: spaceInput.value});
    })

    randomColorButton.addEventListener("click", () => {
      const baseHue = parseInt((Math.random() * 360).toFixed(0));
      const baseSaturation = parseInt((Math.random() * 50).toFixed(0));
      const baseLightness = parseInt((Math.random() * 20).toFixed(0));

      if(this.activeType.includes('target')) {
        hslHueInput.value = baseHue;
        hslSatInput.value = 0;
        hslLightInput.value = 45;
        colorPicker.colorWheel.hsl = [baseHue, 0, 45];
      } else {
        hslHueInput.value = baseHue;
        hslSatInput.value = 50 + baseSaturation;
        hslLightInput.value = 30 + baseLightness;
        colorPicker.colorWheel.hsl = [baseHue, 50 + baseSaturation, 30 + baseLightness];
      }
    });
  }

  _updateColor({h, s, l}) {
    // Add throttling to prevent too frequent updates
    if (this._updateColorTimeout) {
      clearTimeout(this._updateColorTimeout);
    }

    this._updateColorTimeout = setTimeout(() => {
      // Update color
      DataProvider.updateMetadata("uuid", this.activeUUID, "colors", {
        L: `hsl(${(h - 10) % 360}, ${s}%, ${l}%)`, // Overwrite L, R, AVG with the new custom color for simplicity for now
        R: `hsl(${(h + 10) % 360}, ${s}%, ${l}%)`,
        AVG: `hsl(${h}, ${s}%, ${l}%)`,
      });

      // Update the button background in the selection list
      const slButton = document.querySelector(
        `.selection-list-item[data-uuid="${this.activeUUID}"] .sl-color-btn`
      );
      if (slButton) {
        slButton.style.background = `hsl(${h}, ${s}%, ${l}%)`;
      }

      this._updateColorTimeout = null;
    }, 10); // Throttle to max 100 updates per second
  }

  _updateDash({tick, space}) {
    // Add throttling to prevent too frequent updates
    if (this._updateDashTimeout) {
      clearTimeout(this._updateDashTimeout);
    }

    this._updateDashTimeout = setTimeout(() => {
      // Update Dash
      DataProvider.updateMetadata("uuid", this.activeUUID, "dash", `${tick} ${space}`);

      this._updateDashTimeout = null;
    }, 10); // Throttle to max 100 updates per second
  }

  _handleOutsideClick(event) {
    if (this.activePopup && !this.activePopup.contains(event.target)) {
      // Check if the click was on a .sl-color-btn to prevent immediate re-opening
      if (!event.target.closest(".sl-color-btn")) {
        this.activePopup.remove();
        this.activePopup = null;
        document.removeEventListener(
          "click",
          this._handleOutsideClick.bind(this),
          true
        );
      }
    }
  }

  _updateLanguage() {
    if(!this.activePopup) return;

    const hueLabel = this.activePopup.querySelector('label[for="gcw-hsl-hue"');
    const satLabel = this.activePopup.querySelector('label[for="gcw-hsl-sat"');
    const lightLabel = this.activePopup.querySelector('label[for="gcw-hsl-light"');
    const tickLabel = this.activePopup.querySelector('label[for="gcw-tick-length"');
    const spaceLabel = this.activePopup.querySelector('label[for="gcw-space-length"');

    if(hueLabel) hueLabel.innerHTML = StringLoader.getString("extension.graph-color-wheel.label.hue", "H");
    if(satLabel) satLabel.innerHTML = StringLoader.getString("extension.graph-color-wheel.label.saturation", "S");
    if(lightLabel) lightLabel.innerHTML = StringLoader.getString("extension.graph-color-wheel.label.lightness", "L");
    if(tickLabel) tickLabel.innerHTML = StringLoader.getString("extension.graph-color-wheel.label.tick", "Tick");
    if(spaceLabel) spaceLabel.innerHTML = StringLoader.getString("extension.graph-color-wheel.label.space", "Space");
  }
}
