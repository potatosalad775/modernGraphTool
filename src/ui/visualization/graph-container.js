import CoreEvent from "../../core-event.js";
import { graphStyles } from "./graph.styles.js";

class GraphContainer extends HTMLElement {
  constructor() {
    super();

    this.id = "graph-container";
    this.innerHTML = `
      <svg id="fr-graph"></svg>
    `;

    const style = document.createElement("style");
    style.textContent = graphStyles;
    this.appendChild(style);

    CoreEvent.dispatchInitEvent("graph-ui-ready");
  }
}

customElements.define("graph-container", GraphContainer);