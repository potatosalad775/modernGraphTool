import FRNormalizer from "../../model/util/fr-normalizer.js";

const RenderEvent = {
  init(renderEngine) {
    this.renderEngine = renderEngine;
    // Initialize
    this._bindRenderEvent();
  },

  _bindRenderEvent() {
    window.addEventListener("core:fr-phone-added", (e) => {
      this.renderEngine.drawFRCurve(e.detail.uuid);
      this.renderEngine.updateBaseline();
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-phone-removed", (e) => {
      this.renderEngine.eraseFRCurve(e.detail.uuid);
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-target-added", (e) => {
      this.renderEngine.drawFRCurve(e.detail.uuid);
      this.renderEngine.updateBaseline();
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-target-removed", (e) => {
      this.renderEngine.eraseFRCurve(e.detail.uuid);
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-unknown-inserted", (e) => {
      this.renderEngine.drawFRCurve(e.detail.uuid);
      this.renderEngine.updateBaseline();
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-unknown-removed", (e) => {
      this.renderEngine.eraseFRCurve(e.detail.uuid);
      this.renderEngine.updateLabels();
    });
    window.addEventListener("core:fr-normalized", () => {
      this.renderEngine.refreshEveryFRCurves();
    });
    window.addEventListener('core:fr-channel-updated', (e) => {
      this.renderEngine.channelUpdateRunner(e.detail.uuid, e.detail.type);
      this.renderEngine.updateLabels();
    });
    window.addEventListener('core:fr-color-updated', (e) => {
      this.renderEngine.drawFRCurve(e.detail.uuid);
      this.renderEngine.updateLabels();
    });
    window.addEventListener('core:fr-variant-updated', (e) => {
      this.renderEngine.drawFRCurve(e.detail.uuid);
      this.renderEngine.updateLabels();
    });
    window.addEventListener('core:fr-smoothing-updated', () => {
      FRNormalizer.updateNormalization();
    });
    window.addEventListener('core:fr-visibility-updated', () => {
      this.renderEngine.updateLabels();
    });
  }
}

export default RenderEvent;