// @ts-nocheck
import FRNormalizer from "../../model/util/fr-normalizer.js";

const GraphEvent = {
  /**
   * Initialize the render events
   * @param {import('./graph-engine.js').default} graphEngine 
   */
  init(graphEngine) {
    this.graphEngine = graphEngine;
    // Initialize
    this._bindGraphEvent();
  },

  _bindGraphEvent() {
    window.addEventListener("core:fr-phone-added", (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-phone-removed", (e) => {
      this.graphEngine.eraseFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-target-added", (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-target-removed", (e) => {
      this.graphEngine.eraseFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-unknown-inserted", (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-unknown-removed", (e) => {
      this.graphEngine.eraseFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener("core:fr-normalized", () => {
      this.graphEngine.refreshEveryFRCurves();
    });
    window.addEventListener('core:fr-channel-updated', (e) => {
      this.graphEngine.channelUpdateRunner(e.detail.uuid, e.detail.type);
      this.graphEngine.updateLabels();
    });
    window.addEventListener('core:fr-color-updated', (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener('core:fr-dash-updated', (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener('core:fr-variant-updated', (e) => {
      this.graphEngine.drawFRCurve(e.detail.uuid);
      this.graphEngine.updateLabels();
    });
    window.addEventListener('core:fr-smoothing-updated', () => {
      FRNormalizer.updateNormalization();
    });
    window.addEventListener('core:fr-visibility-updated', (e) => {
      this.graphEngine.updateVisibility(e.detail.uuid, e.detail.visible);
    });
  }
}

export default GraphEvent;