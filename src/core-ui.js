import * as CoreAPI from './core-api.js';
import coreStyle from './styles/core.css' with { type: "css" };
import fontStyle from './styles/font-public.css' with { type: "css" };
export * from './core-api.js';

class CoreUI extends HTMLElement {
  constructor() {
    super();

    // Import Core Components
    import('./ui/component-loader.js'); // Component Loader

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
          .menu-bar-item[data-target="list-panel"] {
            display: none;
          }
        }
      </style>
    `;

    document.adoptedStyleSheets = [
      coreStyle,
      fontStyle,
    ];
  }

  connectedCallback() {
    // Initialize Core System
    CoreAPI.CoreEvent.init(CoreAPI);
    // Disable iOS Text Field Zoom
    this._disableIOSTextFieldZoom();
    // Draggable Divider event listener
    this.addEventListener('drag-divider-moved', this._handleDividerMove);
  }

  disconnectedCallback() {
    // Draggable Divider event listener
    this.removeEventListener('drag-divider-moved', this._handleDividerMove);
  }

  _handleDividerMove = (e) => {
    const mainContent = this.querySelector('.main-content');
    const { width: containerWidth, x: containerX } = mainContent.getBoundingClientRect();
    const newWidthPercentage = ((e.detail.currentX - containerX) / containerWidth) * 100;
    
    mainContent.style.gridTemplateColumns = `
      clamp(400px, ${newWidthPercentage}%, calc(100% - 346px))
      5px 
      minmax(340px, 1fr)
    `;
  };

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