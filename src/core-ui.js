import * as CoreAPI from './core-api.js';
import coreStyle from './styles/core.css' with { type: "css" };

// Re-export everything from core-api.js
export * from './core-api.js';

// Make CoreAPI globally available for extensions
globalThis.CoreAPI = CoreAPI.default;

class CoreUI extends HTMLElement {
  constructor() {
    super();
    this.innerHTML = `
      <top-nav-bar></top-nav-bar>
      <section class="main-content">
        <section class="main-graph">
          <graph-container></graph-container>
          <div class="main-graph-list">
            <!-- selection-list should be positioned here -->
          </div>
        </section>
        <drag-divider></drag-divider>
        <section class="main-menu">
          <menu-container></menu-container>
          <menu-carousel></menu-carousel>
        </section>
      </section>
      <tutorial-modal></tutorial-modal>
      <gt-toast></gt-toast>

      <!-- Styles -->
      <style>
        core-ui {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
          
        .main-content {
          flex: 1;
          display: grid;
          grid-template-columns: 65% 5px;
          position: relative;
          height: 0;
        }

        .main-menu {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          grid-column: 3;
        }

        .main-graph {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          grid-column: 1;
          background: var(--gt-color-surface-container-lowest);
        }

        :root[data-mobile] {
          .main-content {
            display: flex;
            flex-direction: column;
          }
          .main-divider, .main-graph-list {
            display: none;
          }
          .main-menu {
            flex: 1;
            background: var(--gt-color-surface);
            border-radius: 0.5rem 0.5rem 0 0;
            border-top: 1px solid var(--gt-color-outline);
          }
        }

        :root:not([data-mobile]) {
          .main-menu {
            min-width: 340px;
          }
          .main-graph-list {
            flex: 1;
            overflow-y: scroll;
            padding: 1rem 0.5rem 1rem 1rem;
            background: var(--gt-color-surface);
            border-radius: 0.5rem 0.5rem 0 0;
            border-top: 1px solid var(--gt-color-outline);
          }
        }
      </style>
    `;

    document.adoptedStyleSheets = [
      coreStyle,
    ];
  }

  connectedCallback() {
    // Initialize Core System
    CoreAPI.CoreEvent.init(CoreAPI);
    // Disable iOS Text Field Zoom
    this._disableIOSTextFieldZoom();
  }

  disconnectedCallback() {
  }

  // Disable iOS Text Field Zoom
  // This code adds 'maximum-scale=1.0' to the viewport meta tag if it's iOS
  // It will prevent the text field from zooming in and out on iOS
  // ... while maintaining the ability to zoom in and out with pinch gesture.
  _disableIOSTextFieldZoom = () => {
    if (!this._isIOS()) { return }
    const element = document.querySelector('meta[name=viewport]')
    if (element !== null) {
      let content = element.getAttribute('content')
      let scalePattern = /maximum\-scale=[0-9\.]+/g
      if (scalePattern.test(content)) {
        content = content.replace(scalePattern, 'maximum-scale=1.0')
      } else {
        content = [content, 'maximum-scale=1.0'].join(', ')
      }
      element.setAttribute('content', content)
    }
  }

  _isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
}

customElements.define('core-ui', CoreUI);

// Core UI Panels
import('./features/device/device-panel.js');
import('./features/graph/graph-panel.js');
import('./features/misc/misc-panel.js');

// Common UI Components
import('./shared/atoms/gt-button.js');
import('./shared/atoms/gt-divider.js');
import('./shared/atoms/gt-toast.js');

// Core UI Components
import('./features/graph/ui/graph-container.js');
import('./shared/layout/top-nav-bar/top-nav-bar.js');
import('./shared/layout/menu-container/menu-container.js');
import('./shared/layout/menu-carousel/menu-carousel.js');
import('./shared/layout/tutorial-modal/tutorial-modal.js');
import('./shared/layout/drag-divider/drag-divider.js');
import('./shared/controls/phone-selector/phone-selector.js');
import("./shared/controls/target-selector/target-selector.js");
import('./shared/controls/normalizer-input/normalizer-input.js');
import('./shared/controls/selection-list/selection-list.js');
import('./shared/controls/smoothing-button/smoothing-button.js');
import('./shared/controls/inspection-toggle/inspection-toggle.js');
import('./shared/controls/graph-scale-button/graph-scale-button.js');
import('./shared/controls/screenshot-button/screenshot-button.js');
import('./shared/controls/share-button/share-button.js');
import('./shared/controls/language-selector/language-selector.js');